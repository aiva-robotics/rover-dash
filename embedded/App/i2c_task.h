#ifndef I2C_TASK_H
#define I2C_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdbool.h>
#include <stdint.h>

typedef enum
{
  I2C_TRANSACTION_READ,
  I2C_TRANSACTION_WRITE
} i2c_transaction_type_t;

typedef struct
{
  i2c_transaction_type_t type;
  uint16_t device_address;
  uint16_t register_address;
  uint16_t register_size;
  uint8_t *data;
  uint16_t length;
} i2c_transaction_t;

void i2c_task_init(I2C_HandleTypeDef *i2c, rover_diag_t *diag);
bool i2c_task_submit(const i2c_transaction_t *transaction);
void i2c_task(void);

#endif
