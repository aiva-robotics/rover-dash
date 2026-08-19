#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <stdbool.h>
#include <stdint.h>

typedef void (*scheduler_task_fn_t)(void);

typedef struct
{
  scheduler_task_fn_t task;
  uint32_t period_ms;
  uint32_t last_run_ms;
} scheduler_task_t;

void scheduler_init(scheduler_task_t *tasks, uint8_t task_count, uint32_t now_ms);
void scheduler_run(scheduler_task_t *tasks, uint8_t task_count, uint32_t now_ms);
bool scheduler_is_due(uint32_t now_ms, uint32_t last_run_ms, uint32_t period_ms);

#endif
