#include "i2c_task.h"

#include <string.h>

#define I2C_QUEUE_LENGTH 12u
#define TMP75_ADDRESS (0x48u << 1)
#define TMP75_TEMPERATURE_REGISTER 0x00u
#define TMP75_POLL_PERIOD_MS 250u
#define INA226_ADDRESS (0x40u << 1)
#define INA226_BUS_VOLTAGE_REGISTER 0x02u
#define INA226_CURRENT_REGISTER 0x04u
#define INA226_CALIBRATION_REGISTER 0x05u
#define INA226_POLL_PERIOD_MS 100u
#define INA226_CALIBRATION_VALUE 2560u
#define INA226_BUS_VOLTAGE_LSB_UV 1250u

typedef enum
{
  I2C_TRANSFER_NONE,
  I2C_TRANSFER_USER_QUEUE,
  I2C_TRANSFER_TMP75_READ,
  I2C_TRANSFER_INA226_CALIBRATION,
  I2C_TRANSFER_INA226_BUS_VOLTAGE,
  I2C_TRANSFER_INA226_CURRENT
} i2c_transfer_owner_t;

typedef enum
{
  INA226_STATE_IDLE,
  INA226_STATE_CALIBRATE,
  INA226_STATE_READ_BUS_VOLTAGE,
  INA226_STATE_READ_CURRENT
} ina226_state_t;

typedef struct
{
  i2c_transaction_t transaction;
  uint8_t data[I2C_TRANSACTION_MAX_LENGTH];
} queued_i2c_transaction_t;

static I2C_HandleTypeDef *i2c_handle;
static rover_state_t *i2c_state;
static rover_diag_t *i2c_diag;
static queued_i2c_transaction_t queue[I2C_QUEUE_LENGTH];
static uint8_t queue_head;
static uint8_t queue_tail;
static volatile bool transaction_active;
static volatile bool transaction_completed;
static volatile bool transaction_failed;
static volatile i2c_transfer_owner_t active_transfer;
static volatile i2c_transfer_owner_t completed_transfer;
static bool ina226_calibrated;
static ina226_state_t ina226_state;
static uint32_t last_tmp75_poll_ms;
static uint32_t last_ina226_poll_ms;
static uint8_t tmp75_temperature_data[2];
static uint8_t ina226_calibration_data[2];
static uint8_t ina226_bus_voltage_data[2];
static uint8_t ina226_current_data[2];

static uint8_t queue_next(uint8_t index)
{
  return (uint8_t)((index + 1u) % I2C_QUEUE_LENGTH);
}

static uint16_t read_u16_be(const uint8_t data[2])
{
  return ((uint16_t)data[0] << 8) | data[1];
}

static void write_u16_be(uint8_t data[2], uint16_t value)
{
  data[0] = (uint8_t)(value >> 8);
  data[1] = (uint8_t)(value & 0xffu);
}

static void record_i2c_error(void)
{
  if (i2c_diag != 0)
  {
    i2c_diag->i2c_errors++;
  }
}

static void complete_tmp75_read(void)
{
  int16_t raw_temperature = (int16_t)(((uint16_t)tmp75_temperature_data[0] << 8) | tmp75_temperature_data[1]);
  if (i2c_state != 0)
  {
    i2c_state->tmp75_temperature_centi_c = (int16_t)(((int32_t)raw_temperature * 100) / 256);
    i2c_state->tmp75_temperature_valid = true;
  }
}

static void complete_ina226_transfer(i2c_transfer_owner_t owner)
{
  if (owner == I2C_TRANSFER_INA226_CALIBRATION)
  {
    ina226_calibrated = true;
    ina226_state = INA226_STATE_READ_BUS_VOLTAGE;
  }
  else if (owner == I2C_TRANSFER_INA226_BUS_VOLTAGE)
  {
    ina226_state = INA226_STATE_READ_CURRENT;
  }
  else if (owner == I2C_TRANSFER_INA226_CURRENT)
  {
    uint32_t bus_voltage_uv = (uint32_t)read_u16_be(ina226_bus_voltage_data) * INA226_BUS_VOLTAGE_LSB_UV;
    if (i2c_state != 0)
    {
      i2c_state->ina226_bus_voltage_mv = (uint16_t)((bus_voltage_uv + 500u) / 1000u);
      i2c_state->ina226_current_ma = (int16_t)read_u16_be(ina226_current_data);
      i2c_state->ina226_valid = true;
    }
    ina226_state = INA226_STATE_IDLE;
  }
}

static void fail_ina226_transfer(void)
{
  if (i2c_state != 0)
  {
    i2c_state->ina226_valid = false;
  }
  ina226_calibrated = false;
  ina226_state = INA226_STATE_IDLE;
}

static bool start_i2c_transfer(i2c_transfer_owner_t owner, i2c_transaction_type_t type, uint16_t device_address, uint16_t register_address, uint16_t register_size, uint8_t *data, uint16_t length)
{
  HAL_StatusTypeDef status;

  if ((i2c_handle == 0) || transaction_active || (HAL_I2C_GetState(i2c_handle) != HAL_I2C_STATE_READY))
  {
    return false;
  }

  active_transfer = owner;
  completed_transfer = I2C_TRANSFER_NONE;
  transaction_completed = false;
  transaction_failed = false;
  transaction_active = true;

  if (type == I2C_TRANSACTION_READ)
  {
    status = HAL_I2C_Mem_Read_IT(i2c_handle, device_address, register_address, register_size, data, length);
  }
  else
  {
    status = HAL_I2C_Mem_Write_IT(i2c_handle, device_address, register_address, register_size, data, length);
  }

  if (status != HAL_OK)
  {
    transaction_active = false;
    active_transfer = I2C_TRANSFER_NONE;
    transaction_completed = false;
    transaction_failed = false;
    record_i2c_error();
    return false;
  }

  return true;
}

static void process_completed_transfer(void)
{
  i2c_transfer_owner_t owner;
  bool failed;
  queued_i2c_transaction_t *completed_user_transaction;

  if (!transaction_completed)
  {
    return;
  }

  owner = completed_transfer;
  failed = transaction_failed;
  completed_transfer = I2C_TRANSFER_NONE;
  transaction_completed = false;
  transaction_failed = false;

  if (failed)
  {
    if (owner == I2C_TRANSFER_USER_QUEUE)
    {
      queue_tail = queue_next(queue_tail);
    }
    else if (owner == I2C_TRANSFER_TMP75_READ)
    {
      if (i2c_state != 0)
      {
        i2c_state->tmp75_temperature_valid = false;
      }
    }
    else if ((owner == I2C_TRANSFER_INA226_CALIBRATION) ||
             (owner == I2C_TRANSFER_INA226_BUS_VOLTAGE) ||
             (owner == I2C_TRANSFER_INA226_CURRENT))
    {
      fail_ina226_transfer();
    }

    record_i2c_error();
    return;
  }

  if (owner == I2C_TRANSFER_USER_QUEUE)
  {
    completed_user_transaction = &queue[queue_tail];
    if ((completed_user_transaction->transaction.type == I2C_TRANSACTION_READ) &&
        (completed_user_transaction->transaction.data != 0) &&
        (completed_user_transaction->transaction.length <= I2C_TRANSACTION_MAX_LENGTH))
    {
      memcpy(completed_user_transaction->transaction.data,
             completed_user_transaction->data,
             completed_user_transaction->transaction.length);
    }
    queue_tail = queue_next(queue_tail);
  }
  else if (owner == I2C_TRANSFER_TMP75_READ)
  {
    complete_tmp75_read();
  }
  else if ((owner == I2C_TRANSFER_INA226_CALIBRATION) ||
           (owner == I2C_TRANSFER_INA226_BUS_VOLTAGE) ||
           (owner == I2C_TRANSFER_INA226_CURRENT))
  {
    complete_ina226_transfer(owner);
  }
}

static void handle_tmp75_start_failure(void)
{
  if (i2c_state != 0)
  {
    i2c_state->tmp75_temperature_valid = false;
  }
}

static void handle_ina226_start_failure(void)
{
  fail_ina226_transfer();
}

void i2c_task_init(I2C_HandleTypeDef *i2c, rover_state_t *state, rover_diag_t *diag)
{
  i2c_handle = i2c;
  i2c_state = state;
  i2c_diag = diag;
  transaction_active = false;
  transaction_completed = false;
  transaction_failed = false;
  active_transfer = I2C_TRANSFER_NONE;
  completed_transfer = I2C_TRANSFER_NONE;
  ina226_calibrated = false;
  ina226_state = INA226_STATE_IDLE;
  last_tmp75_poll_ms = HAL_GetTick();
  last_ina226_poll_ms = HAL_GetTick();
  write_u16_be(ina226_calibration_data, INA226_CALIBRATION_VALUE);
  if (i2c_state != 0)
  {
    i2c_state->tmp75_temperature_centi_c = 0;
    i2c_state->tmp75_temperature_valid = false;
    i2c_state->ina226_bus_voltage_mv = 0u;
    i2c_state->ina226_current_ma = 0;
    i2c_state->ina226_valid = false;
  }
}

bool i2c_task_submit(const i2c_transaction_t *transaction)
{
  uint8_t next = queue_next(queue_head);
  if ((transaction == 0) ||
      (transaction->data == 0) ||
      (transaction->length > I2C_TRANSACTION_MAX_LENGTH) ||
      (next == queue_tail))
  {
    record_i2c_error();
    return false;
  }

  queue[queue_head].transaction = *transaction;
  if (transaction->type == I2C_TRANSACTION_WRITE)
  {
    memcpy(queue[queue_head].data, transaction->data, transaction->length);
  }
  queue_head = next;
  return true;
}

static bool try_start_queued_transaction(void)
{
  queued_i2c_transaction_t *transaction;

  if (queue_head == queue_tail)
  {
    return false;
  }

  transaction = &queue[queue_tail];
  if (!start_i2c_transfer(I2C_TRANSFER_USER_QUEUE,
                          transaction->transaction.type,
                          transaction->transaction.device_address,
                          transaction->transaction.register_address,
                          transaction->transaction.register_size,
                          transaction->data,
                          transaction->transaction.length))
  {
    queue_tail = queue_next(queue_tail);
  }
  return true;
}

static bool try_start_tmp75_poll(uint32_t now_ms)
{
  if ((uint32_t)(now_ms - last_tmp75_poll_ms) < TMP75_POLL_PERIOD_MS)
  {
    return false;
  }

  last_tmp75_poll_ms = now_ms;
  if (!start_i2c_transfer(I2C_TRANSFER_TMP75_READ,
                          I2C_TRANSACTION_READ,
                          TMP75_ADDRESS,
                          TMP75_TEMPERATURE_REGISTER,
                          I2C_MEMADD_SIZE_8BIT,
                          tmp75_temperature_data,
                          sizeof(tmp75_temperature_data)))
  {
    handle_tmp75_start_failure();
  }
  return true;
}

static bool try_start_ina226_poll(uint32_t now_ms)
{
  if (((uint32_t)(now_ms - last_ina226_poll_ms) >= INA226_POLL_PERIOD_MS) &&
      (ina226_state == INA226_STATE_IDLE))
  {
    last_ina226_poll_ms = now_ms;
    ina226_state = ina226_calibrated ? INA226_STATE_READ_BUS_VOLTAGE : INA226_STATE_CALIBRATE;
  }

  if (ina226_state == INA226_STATE_CALIBRATE)
  {
    if (!start_i2c_transfer(I2C_TRANSFER_INA226_CALIBRATION,
                            I2C_TRANSACTION_WRITE,
                            INA226_ADDRESS,
                            INA226_CALIBRATION_REGISTER,
                            I2C_MEMADD_SIZE_8BIT,
                            ina226_calibration_data,
                            sizeof(ina226_calibration_data)))
    {
      handle_ina226_start_failure();
    }
    return true;
  }

  if (ina226_state == INA226_STATE_READ_BUS_VOLTAGE)
  {
    if (!start_i2c_transfer(I2C_TRANSFER_INA226_BUS_VOLTAGE,
                            I2C_TRANSACTION_READ,
                            INA226_ADDRESS,
                            INA226_BUS_VOLTAGE_REGISTER,
                            I2C_MEMADD_SIZE_8BIT,
                            ina226_bus_voltage_data,
                            sizeof(ina226_bus_voltage_data)))
    {
      handle_ina226_start_failure();
    }
    return true;
  }

  if (ina226_state == INA226_STATE_READ_CURRENT)
  {
    if (!start_i2c_transfer(I2C_TRANSFER_INA226_CURRENT,
                            I2C_TRANSACTION_READ,
                            INA226_ADDRESS,
                            INA226_CURRENT_REGISTER,
                            I2C_MEMADD_SIZE_8BIT,
                            ina226_current_data,
                            sizeof(ina226_current_data)))
    {
      handle_ina226_start_failure();
    }
    return true;
  }

  return false;
}

void i2c_task(void)
{
  uint32_t now_ms;

  if (i2c_handle == 0)
  {
    return;
  }

  process_completed_transfer();

  if (transaction_active || transaction_completed || (HAL_I2C_GetState(i2c_handle) != HAL_I2C_STATE_READY))
  {
    return;
  }

  now_ms = HAL_GetTick();
  if (try_start_tmp75_poll(now_ms))
  {
    return;
  }

  if (try_start_ina226_poll(now_ms))
  {
    return;
  }

  (void)try_start_queued_transaction();
}

void HAL_I2C_MemTxCpltCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    completed_transfer = active_transfer;
    active_transfer = I2C_TRANSFER_NONE;
    transaction_failed = false;
    transaction_completed = true;
    transaction_active = false;
  }
}

void HAL_I2C_MemRxCpltCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    completed_transfer = active_transfer;
    active_transfer = I2C_TRANSFER_NONE;
    transaction_failed = false;
    transaction_completed = true;
    transaction_active = false;
  }
}

void HAL_I2C_ErrorCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    completed_transfer = active_transfer;
    active_transfer = I2C_TRANSFER_NONE;
    transaction_failed = true;
    transaction_completed = true;
    transaction_active = false;
  }
}
