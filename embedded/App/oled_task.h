#ifndef OLED_TASK_H
#define OLED_TASK_H

#include "rover_state.h"

typedef enum
{
  DISPLAY_SOURCE_STM32,
  DISPLAY_SOURCE_RPI
} display_source_t;

void oled_task_init(rover_state_t *state, rover_diag_t *diag);
void oled_task(void);
void display_splash(void);
void display_status(const char *line1, const char *line2);
void display_show_local(void);
void display_show_rpi(void);
void display_restore_previous(void);
bool display_receive_rpi_chunk(uint8_t chunk, const uint8_t *data, uint8_t length);
bool display_rpi_update(void);

#endif
