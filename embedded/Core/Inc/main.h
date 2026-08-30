/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32g4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

void HAL_TIM_MspPostInit(TIM_HandleTypeDef *htim);

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define POWER_SWITCH_Pin GPIO_PIN_13
#define POWER_SWITCH_GPIO_Port GPIOC
#define ADC_0_Pin GPIO_PIN_0
#define ADC_0_GPIO_Port GPIOA
#define ADC_1_Pin GPIO_PIN_1
#define ADC_1_GPIO_Port GPIOA
#define ADC_2_Pin GPIO_PIN_2
#define ADC_2_GPIO_Port GPIOA
#define ADC_3_Pin GPIO_PIN_3
#define ADC_3_GPIO_Port GPIOA
#define MOTOR_TEMP_Pin GPIO_PIN_4
#define MOTOR_TEMP_GPIO_Port GPIOA
#define OUTPUT_0_Pin GPIO_PIN_6
#define OUTPUT_0_GPIO_Port GPIOA
#define OUTPUT_1_Pin GPIO_PIN_7
#define OUTPUT_1_GPIO_Port GPIOA
#define OUTPUT_2_Pin GPIO_PIN_0
#define OUTPUT_2_GPIO_Port GPIOB
#define OUTPUT_3_Pin GPIO_PIN_1
#define OUTPUT_3_GPIO_Port GPIOB
#define RPI_POWER_OFF_OK_Pin GPIO_PIN_2
#define RPI_POWER_OFF_OK_GPIO_Port GPIOB
#define SPEED_SENSOR_Pin GPIO_PIN_11
#define SPEED_SENSOR_GPIO_Port GPIOB
#define RC_OUTPUT_3_Pin GPIO_PIN_8
#define RC_OUTPUT_3_GPIO_Port GPIOA
#define RC_OUTPUT_2_Pin GPIO_PIN_9
#define RC_OUTPUT_2_GPIO_Port GPIOA
#define RC_OUTPUT_1_Pin GPIO_PIN_10
#define RC_OUTPUT_1_GPIO_Port GPIOA
#define RC_OUTPUT_0_Pin GPIO_PIN_11
#define RC_OUTPUT_0_GPIO_Port GPIOA
#define BUZZER_Pin GPIO_PIN_12
#define BUZZER_GPIO_Port GPIOA
#define UART_TX_Pin GPIO_PIN_3
#define UART_TX_GPIO_Port GPIOB
#define UART_RX_Pin GPIO_PIN_4
#define UART_RX_GPIO_Port GPIOB
#define REG_5V_EN_Pin GPIO_PIN_9
#define REG_5V_EN_GPIO_Port GPIOB

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
