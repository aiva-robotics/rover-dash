#include "oled_task.h"

#include "i2c_task.h"
#include "version.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#define OLED_ADDRESS (0x3cu << 1)
#define OLED_WIDTH 128u
#define OLED_HEIGHT 32u
#define OLED_PAGE_COUNT (OLED_HEIGHT / 8u)
#define OLED_FRAMEBUFFER_SIZE (OLED_WIDTH * OLED_PAGE_COUNT)
#define OLED_DATA_CHUNK_SIZE 32u
#define DISPLAY_RPI_CHUNK_COUNT 9u
#define DISPLAY_RPI_FULL_CHUNK_SIZE 63u
#define DISPLAY_RPI_LAST_CHUNK_SIZE 8u
#define DISPLAY_RPI_ALL_CHUNKS_MASK 0x01ffu

typedef enum
{
  OLED_STATE_INIT,
  OLED_STATE_IDLE,
  OLED_STATE_SEND_PAGE,
  OLED_STATE_SEND_COL_LOW,
  OLED_STATE_SEND_COL_HIGH,
  OLED_STATE_SEND_DATA
} oled_state_t;

static const uint8_t oled_init_commands[] =
{
  0xaeu,
  0xd5u, 0x80u,
  0xa8u, 0x1fu,
  0xd3u, 0x00u,
  0x40u,
  0x8du, 0x14u,
  0x20u, 0x00u,
  0xa1u,
  0xc8u,
  0xdau, 0x02u,
  0x81u, 0x8fu,
  0xd9u, 0xf1u,
  0xdbu, 0x40u,
  0xa4u,
  0xa6u,
  0xafu
};

static rover_state_t *oled_state_data;
static rover_diag_t *oled_diag;
static oled_state_t oled_state;
static uint8_t init_index;
static uint8_t page_index;
static uint8_t data_offset;
static display_source_t display_source;
static display_source_t previous_display_source;
static bool rpi_framebuffer_valid;
static uint16_t received_chunks;
static const uint8_t *active_framebuffer;
static const uint8_t *pending_framebuffer;
static uint8_t local_framebuffer[OLED_FRAMEBUFFER_SIZE];
static uint8_t rpi_framebuffer[OLED_FRAMEBUFFER_SIZE];

static const uint8_t rovercore_logo_24x24[] =
{
  0xf0u, 0xfcu, 0x0eu, 0x06u, 0x03u, 0x03u, 0x83u, 0xc3u,
  0x63u, 0x33u, 0x1bu, 0x0fu, 0x0fu, 0x1bu, 0x33u, 0x63u,
  0xc3u, 0x83u, 0x03u, 0x03u, 0x06u, 0x0eu, 0xfcu, 0xf0u,
  0x03u, 0x0fu, 0x1cu, 0x30u, 0x60u, 0x60u, 0x61u, 0x63u,
  0x66u, 0x6cu, 0x78u, 0x70u, 0x70u, 0x78u, 0x6cu, 0x66u,
  0x63u, 0x61u, 0x60u, 0x60u, 0x30u, 0x1cu, 0x0fu, 0x03u,
  0x1fu, 0x3fu, 0x70u, 0x60u, 0xc0u, 0xc0u, 0xc0u, 0xc0u,
  0xc0u, 0xc0u, 0xffu, 0xffu, 0xcfu, 0xdbu, 0xf3u, 0xe3u,
  0xc3u, 0xc3u, 0xc0u, 0xc0u, 0x60u, 0x70u, 0x3fu, 0x1fu
};

static bool oled_submit_command(uint8_t command)
{
  i2c_transaction_t transaction;

  transaction.type = I2C_TRANSACTION_WRITE;
  transaction.device_address = OLED_ADDRESS;
  transaction.register_address = 0x00u;
  transaction.register_size = I2C_MEMADD_SIZE_8BIT;
  transaction.data = &command;
  transaction.length = 1u;

  return i2c_task_submit(&transaction);
}

static bool oled_submit_data(const uint8_t *data, uint8_t length)
{
  i2c_transaction_t transaction;

  transaction.type = I2C_TRANSACTION_WRITE;
  transaction.device_address = OLED_ADDRESS;
  transaction.register_address = 0x40u;
  transaction.register_size = I2C_MEMADD_SIZE_8BIT;
  transaction.data = (uint8_t *)data;
  transaction.length = length;

  return i2c_task_submit(&transaction);
}

static uint8_t glyph_column(char character, uint8_t column)
{
  static const uint8_t digits[10][5] =
  {
    {0x3eu, 0x51u, 0x49u, 0x45u, 0x3eu},
    {0x00u, 0x42u, 0x7fu, 0x40u, 0x00u},
    {0x42u, 0x61u, 0x51u, 0x49u, 0x46u},
    {0x21u, 0x41u, 0x45u, 0x4bu, 0x31u},
    {0x18u, 0x14u, 0x12u, 0x7fu, 0x10u},
    {0x27u, 0x45u, 0x45u, 0x45u, 0x39u},
    {0x3cu, 0x4au, 0x49u, 0x49u, 0x30u},
    {0x01u, 0x71u, 0x09u, 0x05u, 0x03u},
    {0x36u, 0x49u, 0x49u, 0x49u, 0x36u},
    {0x06u, 0x49u, 0x49u, 0x29u, 0x1eu}
  };

  if (column >= 5u)
  {
    return 0u;
  }

  if ((character >= '0') && (character <= '9'))
  {
    return digits[(uint8_t)(character - '0')][column];
  }

  switch (character)
  {
    case 'A': return (uint8_t[]){0x7eu, 0x11u, 0x11u, 0x11u, 0x7eu}[column];
    case 'B': return (uint8_t[]){0x7fu, 0x49u, 0x49u, 0x49u, 0x36u}[column];
    case 'C': return (uint8_t[]){0x3eu, 0x41u, 0x41u, 0x41u, 0x22u}[column];
    case 'D': return (uint8_t[]){0x7fu, 0x41u, 0x41u, 0x22u, 0x1cu}[column];
    case 'E': return (uint8_t[]){0x7fu, 0x49u, 0x49u, 0x49u, 0x41u}[column];
    case 'F': return (uint8_t[]){0x7fu, 0x09u, 0x09u, 0x09u, 0x01u}[column];
    case 'G': return (uint8_t[]){0x3eu, 0x41u, 0x49u, 0x49u, 0x7au}[column];
    case 'H': return (uint8_t[]){0x7fu, 0x08u, 0x08u, 0x08u, 0x7fu}[column];
    case 'I': return (uint8_t[]){0x00u, 0x41u, 0x7fu, 0x41u, 0x00u}[column];
    case 'L': return (uint8_t[]){0x7fu, 0x40u, 0x40u, 0x40u, 0x40u}[column];
    case 'M': return (uint8_t[]){0x7fu, 0x02u, 0x0cu, 0x02u, 0x7fu}[column];
    case 'N': return (uint8_t[]){0x7fu, 0x04u, 0x08u, 0x10u, 0x7fu}[column];
    case 'O': return (uint8_t[]){0x3eu, 0x41u, 0x41u, 0x41u, 0x3eu}[column];
    case 'P': return (uint8_t[]){0x7fu, 0x09u, 0x09u, 0x09u, 0x06u}[column];
    case 'R': return (uint8_t[]){0x7fu, 0x09u, 0x19u, 0x29u, 0x46u}[column];
    case 'S': return (uint8_t[]){0x46u, 0x49u, 0x49u, 0x49u, 0x31u}[column];
    case 'T': return (uint8_t[]){0x01u, 0x01u, 0x7fu, 0x01u, 0x01u}[column];
    case 'U': return (uint8_t[]){0x3fu, 0x40u, 0x40u, 0x40u, 0x3fu}[column];
    case 'V': return (uint8_t[]){0x1fu, 0x20u, 0x40u, 0x20u, 0x1fu}[column];
    case 'W': return (uint8_t[]){0x7fu, 0x20u, 0x18u, 0x20u, 0x7fu}[column];
    case 'Y': return (uint8_t[]){0x07u, 0x08u, 0x70u, 0x08u, 0x07u}[column];
    case ':': return (uint8_t[]){0x00u, 0x36u, 0x36u, 0x00u, 0x00u}[column];
    case '-': return (uint8_t[]){0x08u, 0x08u, 0x08u, 0x08u, 0x08u}[column];
    case '.': return (uint8_t[]){0x00u, 0x60u, 0x60u, 0x00u, 0x00u}[column];
    case ' ': return 0u;
    default: return 0u;
  }
}

static void framebuffer_clear(uint8_t *framebuffer)
{
  memset(framebuffer, 0, OLED_FRAMEBUFFER_SIZE);
}

static void framebuffer_draw_char(uint8_t *framebuffer, uint8_t x, uint8_t page, char character)
{
  if ((framebuffer == 0) || (page >= OLED_PAGE_COUNT) || (x >= OLED_WIDTH))
  {
    return;
  }

  for (uint8_t column = 0u; column < 5u; column++)
  {
    if ((uint16_t)x + column < OLED_WIDTH)
    {
      framebuffer[(uint16_t)page * OLED_WIDTH + x + column] = glyph_column(character, column);
    }
  }
}

static void framebuffer_draw_text(uint8_t *framebuffer, uint8_t x, uint8_t page, const char *text)
{
  if (text == 0)
  {
    return;
  }

  while ((*text != '\0') && (x < OLED_WIDTH))
  {
    framebuffer_draw_char(framebuffer, x, page, *text);
    x = (uint8_t)(x + 6u);
    text++;
  }
}

static void framebuffer_draw_bitmap_24x24(uint8_t *framebuffer, uint8_t x, uint8_t page, const uint8_t *bitmap)
{
  if ((framebuffer == 0) || (bitmap == 0) || (page > (OLED_PAGE_COUNT - 3u)) || (x > (OLED_WIDTH - 24u)))
  {
    return;
  }

  for (uint8_t bitmap_page = 0u; bitmap_page < 3u; bitmap_page++)
  {
    for (uint8_t column = 0u; column < 24u; column++)
    {
      framebuffer[((uint16_t)page + bitmap_page) * OLED_WIDTH + x + column] = bitmap[(uint16_t)bitmap_page * 24u + column];
    }
  }
}

static void oled_write_framebuffer(const uint8_t *buffer)
{
  if (buffer == 0)
  {
    return;
  }

  pending_framebuffer = buffer;
  if (oled_state == OLED_STATE_IDLE)
  {
    active_framebuffer = pending_framebuffer;
    pending_framebuffer = 0;
    page_index = 0u;
    data_offset = 0u;
    oled_state = OLED_STATE_SEND_PAGE;
  }
}

void display_status(const char *line1, const char *line2)
{
  framebuffer_clear(local_framebuffer);
  framebuffer_draw_text(local_framebuffer, 0u, 0u, line1);
  framebuffer_draw_text(local_framebuffer, 0u, 2u, line2);
  display_show_local();
}

void display_splash(void)
{
  framebuffer_clear(local_framebuffer);
  framebuffer_draw_bitmap_24x24(local_framebuffer, 0u, 0u, rovercore_logo_24x24);
  framebuffer_draw_text(local_framebuffer, 32u, 0u, ROVERCORE_FIRMWARE_NAME);
  framebuffer_draw_text(local_framebuffer, 32u, 2u, "FW " ROVERCORE_FIRMWARE_VERSION);
  framebuffer_draw_text(local_framebuffer, 32u, 3u, "STARTING...");
  display_show_local();
}

void display_show_local(void)
{
  if (display_source != DISPLAY_SOURCE_STM32)
  {
    previous_display_source = display_source;
  }
  display_source = DISPLAY_SOURCE_STM32;
  oled_write_framebuffer(local_framebuffer);
}

void display_show_rpi(void)
{
  if (!rpi_framebuffer_valid)
  {
    return;
  }

  if (display_source != DISPLAY_SOURCE_RPI)
  {
    previous_display_source = display_source;
  }
  display_source = DISPLAY_SOURCE_RPI;
  oled_write_framebuffer(rpi_framebuffer);
}

void display_restore_previous(void)
{
  if ((previous_display_source == DISPLAY_SOURCE_RPI) && rpi_framebuffer_valid)
  {
    display_show_rpi();
  }
  else
  {
    display_show_local();
  }
}

bool display_receive_rpi_chunk(uint8_t chunk, const uint8_t *data, uint8_t length)
{
  uint16_t offset;
  uint16_t remaining_framebuffer_bytes;
  uint8_t expected_length;
  uint8_t copy_length;

  if ((chunk >= DISPLAY_RPI_CHUNK_COUNT) || (data == 0))
  {
    return false;
  }

  expected_length = (chunk == (DISPLAY_RPI_CHUNK_COUNT - 1u)) ? DISPLAY_RPI_LAST_CHUNK_SIZE : DISPLAY_RPI_FULL_CHUNK_SIZE;
  if (length < expected_length)
  {
    return false;
  }

  if (chunk == 0u)
  {
    received_chunks = 0u;
  }

  offset = (uint16_t)chunk * DISPLAY_RPI_FULL_CHUNK_SIZE;
  remaining_framebuffer_bytes = (uint16_t)(OLED_FRAMEBUFFER_SIZE - offset);
  copy_length = length;
  if (copy_length > remaining_framebuffer_bytes)
  {
    copy_length = (uint8_t)remaining_framebuffer_bytes;
  }
  if (copy_length > DISPLAY_RPI_FULL_CHUNK_SIZE)
  {
    copy_length = DISPLAY_RPI_FULL_CHUNK_SIZE;
  }

  memcpy(&rpi_framebuffer[offset], data, copy_length);
  received_chunks |= (uint16_t)(1u << chunk);

  return true;
}

bool display_rpi_update(void)
{
  if (received_chunks != DISPLAY_RPI_ALL_CHUNKS_MASK)
  {
    return false;
  }

  rpi_framebuffer_valid = true;
  received_chunks = 0u;
  display_show_rpi();
  return true;
}

void oled_task_init(rover_state_t *state, rover_diag_t *diag)
{
  oled_state_data = state;
  oled_diag = diag;
  oled_state = OLED_STATE_INIT;
  init_index = 0u;
  page_index = 0u;
  data_offset = 0u;
  display_source = DISPLAY_SOURCE_STM32;
  previous_display_source = DISPLAY_SOURCE_STM32;
  rpi_framebuffer_valid = false;
  received_chunks = 0u;
  active_framebuffer = local_framebuffer;
  pending_framebuffer = local_framebuffer;
  framebuffer_clear(local_framebuffer);
  framebuffer_clear(rpi_framebuffer);
  display_splash();
}

void oled_task(void)
{
  uint8_t remaining;

  if (oled_state_data == 0)
  {
    return;
  }

  if (oled_state == OLED_STATE_INIT)
  {
    if (init_index < sizeof(oled_init_commands))
    {
      if (oled_submit_command(oled_init_commands[init_index]))
      {
        init_index++;
      }
      return;
    }

    active_framebuffer = pending_framebuffer;
    pending_framebuffer = 0;
    page_index = 0u;
    data_offset = 0u;
    oled_state = OLED_STATE_SEND_PAGE;
  }

  if (oled_state == OLED_STATE_IDLE)
  {
    if (pending_framebuffer != 0)
    {
      active_framebuffer = pending_framebuffer;
      pending_framebuffer = 0;
      page_index = 0u;
      data_offset = 0u;
      oled_state = OLED_STATE_SEND_PAGE;
    }
    else
    {
      return;
    }
  }

  if (oled_state == OLED_STATE_SEND_PAGE)
  {
    if (oled_submit_command((uint8_t)(0xb0u | page_index)))
    {
      oled_state = OLED_STATE_SEND_COL_LOW;
    }
  }
  else if (oled_state == OLED_STATE_SEND_COL_LOW)
  {
    if (oled_submit_command(0x00u))
    {
      oled_state = OLED_STATE_SEND_COL_HIGH;
    }
  }
  else if (oled_state == OLED_STATE_SEND_COL_HIGH)
  {
    if (oled_submit_command(0x10u))
    {
      oled_state = OLED_STATE_SEND_DATA;
    }
  }
  else if (oled_state == OLED_STATE_SEND_DATA)
  {
    remaining = (uint8_t)(OLED_WIDTH - data_offset);
    if (remaining > OLED_DATA_CHUNK_SIZE)
    {
      remaining = OLED_DATA_CHUNK_SIZE;
    }

    if (oled_submit_data(&active_framebuffer[(uint16_t)page_index * OLED_WIDTH + data_offset], remaining))
    {
      data_offset = (uint8_t)(data_offset + remaining);
      if (data_offset >= OLED_WIDTH)
      {
        data_offset = 0u;
        page_index++;
        oled_state = (page_index >= OLED_PAGE_COUNT) ? OLED_STATE_IDLE : OLED_STATE_SEND_PAGE;
      }
    }
  }

  (void)oled_diag;
}
