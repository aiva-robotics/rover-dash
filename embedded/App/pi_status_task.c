#include "pi_status_task.h"

#include "control_task.h"
#include "main.h"
#include "oled_task.h"
#include "protocol.h"
#include "uart_task.h"

#define RPI_BOOT_POWER_DELAY_MS 2000u
#define RPI_READY_TIMEOUT_MS 10000u
#define RPI_COMMUNICATION_TIMEOUT_MS 2000u
#define RPI_SHUTDOWN_REPEAT_MS 100u
#define POWER_BUTTON_DEBOUNCE_MS 50u
#define POWER_BUTTON_LONG_PRESS_MS 3000u
#define POWER_SWITCH_PRESSED_STATE GPIO_PIN_RESET
#define RPI_POWER_OFF_OK_ACTIVE_STATE GPIO_PIN_SET

typedef enum
{
  PI_STATUS_BOOT_DELAY = 0,
  PI_STATUS_WAIT_READY,
  PI_STATUS_RUNNING,
  PI_STATUS_SHUTDOWN_REQUESTED,
  PI_STATUS_POWERED_OFF,
  PI_STATUS_FORCED_OFF
} pi_status_state_t;

static rover_state_t *pi_state;
static rover_diag_t *pi_diag;
static pi_status_state_t pi_status;
static uint32_t pi_state_started_ms;
static uint32_t last_shutdown_tx_ms;
static uint32_t button_changed_ms;
static uint32_t button_pressed_ms;
static bool button_stable_pressed;
static bool button_sample_pressed;
static bool long_press_handled;
static bool wait_ready_offline_displayed;
static bool running_offline_displayed;

static void set_pi_power(bool enabled)
{
  HAL_GPIO_WritePin(REG_5V_EN_GPIO_Port, REG_5V_EN_Pin, enabled ? GPIO_PIN_SET : GPIO_PIN_RESET);
  if (pi_state != 0)
  {
    pi_state->rpi_power_enabled = enabled;
  }
}

static bool read_power_button_pressed(void)
{
  return HAL_GPIO_ReadPin(POWER_SWITCH_GPIO_Port, POWER_SWITCH_Pin) == POWER_SWITCH_PRESSED_STATE;
}

static bool read_poweroff_ok(void)
{
  return HAL_GPIO_ReadPin(RPI_POWER_OFF_OK_GPIO_Port, RPI_POWER_OFF_OK_Pin) == RPI_POWER_OFF_OK_ACTIVE_STATE;
}

static void enter_status(pi_status_state_t status, uint32_t now_ms)
{
  pi_status = status;
  pi_state_started_ms = now_ms;
  if (pi_state != 0)
  {
    pi_state->rpi_status = (uint8_t)status;
  }

  switch (status)
  {
    case PI_STATUS_BOOT_DELAY:
      display_splash();
      break;
    case PI_STATUS_WAIT_READY:
      display_status("RASPBERRY PI", "BOOTING...");
      wait_ready_offline_displayed = false;
      running_offline_displayed = false;
      break;
    case PI_STATUS_RUNNING:
      display_status("RASPBERRY PI", "CONNECTED");
      display_restore_previous();
      running_offline_displayed = false;
      break;
    case PI_STATUS_SHUTDOWN_REQUESTED:
      display_status("SHUTDOWN REQ", "WAIT PI OFF");
      break;
    case PI_STATUS_POWERED_OFF:
      display_status("SHUTDOWN READY", "5V OFF");
      break;
    case PI_STATUS_FORCED_OFF:
    default:
      display_status("FORCED OFF", "5V DISABLED");
      break;
  }
}

static void request_failsafe(bool enabled)
{
  control_task_set_forced_failsafe(enabled);
}

static void send_shutdown_request(uint32_t now_ms)
{
  uint8_t frame[PROTOCOL_MAX_FRAME_SIZE];
  size_t frame_length = 0u;

  if (!protocol_encode_packet(PROTOCOL_MSG_RPI_SHUTDOWN, 0, 0u, frame, sizeof(frame), &frame_length))
  {
    return;
  }

  if (uart_task_send_frame(frame, (uint16_t)frame_length))
  {
    last_shutdown_tx_ms = now_ms;
  }
}

static void start_shutdown(uint32_t now_ms)
{
  request_failsafe(true);
  if (pi_state != 0)
  {
    pi_state->rpi_connected = false;
    pi_state->rpi_shutdown_requested = true;
  }
  if (pi_diag != 0)
  {
    pi_diag->rpi_shutdown_requests++;
  }
  enter_status(PI_STATUS_SHUTDOWN_REQUESTED, now_ms);
  last_shutdown_tx_ms = now_ms - RPI_SHUTDOWN_REPEAT_MS;
}

static void force_poweroff(uint32_t now_ms)
{
  request_failsafe(true);
  set_pi_power(false);
  if (pi_state != 0)
  {
    pi_state->rpi_connected = false;
    pi_state->rpi_shutdown_requested = false;
  }
  if (pi_diag != 0)
  {
    pi_diag->rpi_forced_poweroffs++;
  }
  enter_status(PI_STATUS_FORCED_OFF, now_ms);
}

static bool power_button_clicked(uint32_t now_ms)
{
  bool pressed = read_power_button_pressed();
  bool clicked = false;

  if (pressed != button_sample_pressed)
  {
    button_sample_pressed = pressed;
    button_changed_ms = now_ms;
  }

  if (((uint32_t)(now_ms - button_changed_ms) >= POWER_BUTTON_DEBOUNCE_MS) && (button_stable_pressed != button_sample_pressed))
  {
    button_stable_pressed = button_sample_pressed;
    if (button_stable_pressed)
    {
      button_pressed_ms = now_ms;
      long_press_handled = false;
    }
    else if (!long_press_handled)
    {
      clicked = true;
    }
  }

  if (button_stable_pressed && !long_press_handled && ((uint32_t)(now_ms - button_pressed_ms) >= POWER_BUTTON_LONG_PRESS_MS))
  {
    long_press_handled = true;
    force_poweroff(now_ms);
  }

  return clicked;
}

void pi_status_task_init(rover_state_t *state, rover_diag_t *diag)
{
  uint32_t now_ms = HAL_GetTick();

  pi_state = state;
  pi_diag = diag;
  button_sample_pressed = read_power_button_pressed();
  button_stable_pressed = button_sample_pressed;
  button_changed_ms = now_ms;
  button_pressed_ms = now_ms;
  long_press_handled = false;
  wait_ready_offline_displayed = false;
  running_offline_displayed = false;

  set_pi_power(false);
  request_failsafe(true);
  if (pi_state != 0)
  {
    pi_state->rpi_last_rx_ms = 0u;
    pi_state->rpi_connected = false;
    pi_state->rpi_poweroff_ok = read_poweroff_ok();
    pi_state->rpi_shutdown_requested = false;
  }
  enter_status(PI_STATUS_BOOT_DELAY, now_ms);
}

void pi_status_task(void)
{
  uint32_t now_ms = HAL_GetTick();
  bool clicked = power_button_clicked(now_ms);
  bool poweroff_ok = read_poweroff_ok();

  if (pi_state != 0)
  {
    pi_state->rpi_poweroff_ok = poweroff_ok;
  }

  if ((pi_status == PI_STATUS_FORCED_OFF) || (pi_status == PI_STATUS_POWERED_OFF))
  {
    request_failsafe(true);
    set_pi_power(false);
    return;
  }

  switch (pi_status)
  {
    case PI_STATUS_BOOT_DELAY:
      request_failsafe(true);
      set_pi_power(true);
      if ((uint32_t)(now_ms - pi_state_started_ms) >= RPI_BOOT_POWER_DELAY_MS)
      {
        enter_status(PI_STATUS_WAIT_READY, now_ms);
      }
      break;

    case PI_STATUS_WAIT_READY:
      request_failsafe(true);
      if ((pi_state != 0) && pi_state->rpi_connected)
      {
        request_failsafe(false);
        enter_status(PI_STATUS_RUNNING, now_ms);
      }
      else if (!wait_ready_offline_displayed && ((uint32_t)(now_ms - pi_state_started_ms) >= RPI_READY_TIMEOUT_MS))
      {
        display_status("RASPBERRY PI", "OFFLINE");
        wait_ready_offline_displayed = true;
      }
      break;

    case PI_STATUS_RUNNING:
      request_failsafe(false);
      if ((pi_state != 0) &&
          pi_state->rpi_connected &&
          ((uint32_t)(now_ms - pi_state->rpi_last_rx_ms) >= RPI_COMMUNICATION_TIMEOUT_MS))
      {
        pi_state->rpi_connected = false;
        display_status("RASPBERRY PI", "OFFLINE");
        running_offline_displayed = true;
      }
      else if ((pi_state != 0) && pi_state->rpi_connected && running_offline_displayed)
      {
        display_status("RASPBERRY PI", "CONNECTED");
        display_restore_previous();
        running_offline_displayed = false;
      }
      if (clicked)
      {
        start_shutdown(now_ms);
      }
      break;

    case PI_STATUS_SHUTDOWN_REQUESTED:
      request_failsafe(true);
      if ((uint32_t)(now_ms - last_shutdown_tx_ms) >= RPI_SHUTDOWN_REPEAT_MS)
      {
        send_shutdown_request(now_ms);
      }
      if (poweroff_ok)
      {
        set_pi_power(false);
        if (pi_state != 0)
        {
          pi_state->rpi_connected = false;
          pi_state->rpi_shutdown_requested = false;
        }
        enter_status(PI_STATUS_POWERED_OFF, now_ms);
      }
      break;

    case PI_STATUS_POWERED_OFF:
    case PI_STATUS_FORCED_OFF:
    default:
      break;
  }
}
