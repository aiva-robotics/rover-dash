#include "i2c_task.h"

#define I2C_QUEUE_LENGTH 8u
#define TMP75_ADDRESS (0x48u << 1)
#define TMP75_TEMPERATURE_REGISTER 0x00u
#define TMP75_POLL_PERIOD_MS 250u
#define TMP75_READ_TIMEOUT_MS 2u
#define INA226_ADDRESS (0x40u << 1)
#define INA226_BUS_VOLTAGE_REGISTER 0x02u
#define INA226_CURRENT_REGISTER 0x04u
#define INA226_CALIBRATION_REGISTER 0x05u
#define INA226_POLL_PERIOD_MS 100u
#define INA226_READ_TIMEOUT_MS 2u
#define INA226_WRITE_TIMEOUT_MS 2u
#define INA226_CALIBRATION_VALUE 2560u
#define INA226_BUS_VOLTAGE_LSB_UV 1250u

static I2C_HandleTypeDef *i2c_handle;
static rover_state_t *i2c_state;
static rover_diag_t *i2c_diag;
static i2c_transaction_t queue[I2C_QUEUE_LENGTH];
static uint8_t queue_head;
static uint8_t queue_tail;
static bool transaction_active;
static uint32_t last_tmp75_poll_ms;
static uint32_t last_ina226_poll_ms;

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

void i2c_task_init(I2C_HandleTypeDef *i2c, rover_state_t *state, rover_diag_t *diag)
{
  i2c_handle = i2c;
  i2c_state = state;
  i2c_diag = diag;
  last_tmp75_poll_ms = HAL_GetTick();
  last_ina226_poll_ms = HAL_GetTick();
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
  if ((transaction == 0) || (next == queue_tail))
  {
    return false;
  }

  queue[queue_head] = *transaction;
  queue_head = next;
  return true;
}

void i2c_task(void)
{
  if ((i2c_handle == 0) || transaction_active)
  {
    return;
  }

  if (queue_head == queue_tail)
  {
    uint32_t now_ms = HAL_GetTick();
    if ((uint32_t)(now_ms - last_tmp75_poll_ms) >= TMP75_POLL_PERIOD_MS)
    {
      uint8_t temperature_data[2] = {0u, 0u};
      last_tmp75_poll_ms = now_ms;

      if (HAL_I2C_Mem_Read(i2c_handle, TMP75_ADDRESS, TMP75_TEMPERATURE_REGISTER, I2C_MEMADD_SIZE_8BIT, temperature_data, sizeof(temperature_data), TMP75_READ_TIMEOUT_MS) == HAL_OK)
      {
        int16_t raw_temperature = (int16_t)(((uint16_t)temperature_data[0] << 8) | temperature_data[1]);
        if (i2c_state != 0)
        {
          i2c_state->tmp75_temperature_centi_c = (int16_t)(((int32_t)raw_temperature * 100) / 256);
          i2c_state->tmp75_temperature_valid = true;
        }
      }
      else
      {
        if (i2c_state != 0)
        {
          i2c_state->tmp75_temperature_valid = false;
        }
        if (i2c_diag != 0)
        {
          i2c_diag->i2c_errors++;
        }
      }
    }

    if ((uint32_t)(now_ms - last_ina226_poll_ms) >= INA226_POLL_PERIOD_MS)
    {
      uint8_t calibration_data[2];
      uint8_t bus_voltage_data[2] = {0u, 0u};
      uint8_t current_data[2] = {0u, 0u};
      bool read_ok = false;

      last_ina226_poll_ms = now_ms;
      write_u16_be(calibration_data, INA226_CALIBRATION_VALUE);

      if (HAL_I2C_Mem_Write(i2c_handle, INA226_ADDRESS, INA226_CALIBRATION_REGISTER, I2C_MEMADD_SIZE_8BIT, calibration_data, sizeof(calibration_data), INA226_WRITE_TIMEOUT_MS) == HAL_OK)
      {
        if (HAL_I2C_Mem_Read(i2c_handle, INA226_ADDRESS, INA226_BUS_VOLTAGE_REGISTER, I2C_MEMADD_SIZE_8BIT, bus_voltage_data, sizeof(bus_voltage_data), INA226_READ_TIMEOUT_MS) == HAL_OK)
        {
          read_ok = HAL_I2C_Mem_Read(i2c_handle, INA226_ADDRESS, INA226_CURRENT_REGISTER, I2C_MEMADD_SIZE_8BIT, current_data, sizeof(current_data), INA226_READ_TIMEOUT_MS) == HAL_OK;
        }
      }

      if (read_ok)
      {
        uint32_t bus_voltage_uv = (uint32_t)read_u16_be(bus_voltage_data) * INA226_BUS_VOLTAGE_LSB_UV;
        if (i2c_state != 0)
        {
          i2c_state->ina226_bus_voltage_mv = (uint16_t)((bus_voltage_uv + 500u) / 1000u);
          i2c_state->ina226_current_ma = (int16_t)read_u16_be(current_data);
          i2c_state->ina226_valid = true;
        }
      }
      else
      {
        if (i2c_state != 0)
        {
          i2c_state->ina226_valid = false;
        }
        if (i2c_diag != 0)
        {
          i2c_diag->i2c_errors++;
        }
      }
    }
    return;
  }

  i2c_transaction_t transaction = queue[queue_tail];
  HAL_StatusTypeDef status;

  transaction_active = true;
  if (transaction.type == I2C_TRANSACTION_READ)
  {
    status = HAL_I2C_Mem_Read_IT(i2c_handle, transaction.device_address, transaction.register_address, transaction.register_size, transaction.data, transaction.length);
  }
  else
  {
    status = HAL_I2C_Mem_Write_IT(i2c_handle, transaction.device_address, transaction.register_address, transaction.register_size, transaction.data, transaction.length);
  }

  if (status == HAL_OK)
  {
    queue_tail = queue_next(queue_tail);
  }
  else
  {
    transaction_active = false;
    if (i2c_diag != 0)
    {
      i2c_diag->i2c_errors++;
    }
  }
}

void HAL_I2C_MemTxCpltCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    transaction_active = false;
  }
}

void HAL_I2C_MemRxCpltCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    transaction_active = false;
  }
}

void HAL_I2C_ErrorCallback(I2C_HandleTypeDef *hi2c)
{
  if (hi2c == i2c_handle)
  {
    transaction_active = false;
    if (i2c_diag != 0)
    {
      i2c_diag->i2c_errors++;
    }
  }
}
