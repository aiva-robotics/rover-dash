#include "i2c_task.h"

#define I2C_QUEUE_LENGTH 8u

static I2C_HandleTypeDef *i2c_handle;
static rover_diag_t *i2c_diag;
static i2c_transaction_t queue[I2C_QUEUE_LENGTH];
static uint8_t queue_head;
static uint8_t queue_tail;
static bool transaction_active;

static uint8_t queue_next(uint8_t index)
{
  return (uint8_t)((index + 1u) % I2C_QUEUE_LENGTH);
}

void i2c_task_init(I2C_HandleTypeDef *i2c, rover_diag_t *diag)
{
  i2c_handle = i2c;
  i2c_diag = diag;
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
  if ((i2c_handle == 0) || transaction_active || (queue_head == queue_tail))
  {
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
