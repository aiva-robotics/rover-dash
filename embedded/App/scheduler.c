#include "scheduler.h"

void scheduler_init(scheduler_task_t *tasks, uint8_t task_count, uint32_t now_ms)
{
  for (uint8_t i = 0; i < task_count; i++)
  {
    tasks[i].last_run_ms = now_ms;
  }
}

bool scheduler_is_due(uint32_t now_ms, uint32_t last_run_ms, uint32_t period_ms)
{
  return (uint32_t)(now_ms - last_run_ms) >= period_ms;
}

void scheduler_run(scheduler_task_t *tasks, uint8_t task_count, uint32_t now_ms)
{
  for (uint8_t i = 0; i < task_count; i++)
  {
    if ((tasks[i].task != 0) && scheduler_is_due(now_ms, tasks[i].last_run_ms, tasks[i].period_ms))
    {
      tasks[i].last_run_ms += tasks[i].period_ms;
      if (scheduler_is_due(now_ms, tasks[i].last_run_ms, tasks[i].period_ms))
      {
        tasks[i].last_run_ms = now_ms;
      }
      tasks[i].task();
    }
  }
}
