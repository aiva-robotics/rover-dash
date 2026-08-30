#include "app.h"

#include "adc_task.h"
#include "buzzer.h"
#include "control_task.h"
#include "i2c_task.h"
#include "pi_status_task.h"
#include "scheduler.h"
#include "speed_task.h"
#include "status_task.h"
#include "uart_task.h"

extern ADC_HandleTypeDef hadc1;
extern ADC_HandleTypeDef hadc2;
extern I2C_HandleTypeDef hi2c1;
extern TIM_HandleTypeDef htim1;
extern TIM_HandleTypeDef htim2;
extern TIM_HandleTypeDef htim4;
extern TIM_HandleTypeDef htim6;
extern UART_HandleTypeDef huart2;

static rover_state_t rover_state;
static rover_diag_t rover_diag;

static scheduler_task_t tasks[] =
{
  {control_task, 10u, 0u},
  {uart_task, 1u, 0u},
  {adc_task, 10u, 0u},
  {i2c_task, 10u, 0u},
  {pi_status_task, 10u, 0u},
  {speed_task, 10u, 0u},
  {status_task, 100u, 0u}
};

void app_init(void)
{
  control_task_init(&htim1, &rover_state, &rover_diag);
  adc_task_init(&hadc1, &hadc2, &htim6, &rover_state, &rover_diag);
  uart_task_init(&huart2, &rover_state, &rover_diag);
  i2c_task_init(&hi2c1, &rover_state, &rover_diag);
  speed_task_init(&htim2, &rover_state, &rover_diag);
  buzzer_init(&htim4);
  pi_status_task_init(&rover_state, &rover_diag);
  status_task_init(&rover_state, &rover_diag);
  scheduler_init(tasks, (uint8_t)(sizeof(tasks) / sizeof(tasks[0])), HAL_GetTick());
}

void app_run(void)
{
  uint32_t now_ms = HAL_GetTick();
  rover_state.uptime_ms = now_ms;
  scheduler_run(tasks, (uint8_t)(sizeof(tasks) / sizeof(tasks[0])), now_ms);
}

rover_state_t *app_get_state(void)
{
  return &rover_state;
}

rover_diag_t *app_get_diag(void)
{
  return &rover_diag;
}
