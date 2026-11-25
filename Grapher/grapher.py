from pathlib import Path
from pyray import *  # pyright: ignore


class Item:
    font_size:int = 36
    spacing:int = 1
    buffer:int = 12
    def __init__(self, content:str) -> None:
        text_size = measure_text_ex(font, content, self.font_size, self.spacing)
        draw_rectangle(200,
                       200,
                       int(text_size.x) + self.buffer,
                       int(text_size.y) + self.buffer,
                       BLUE)
        draw_text_ex(font,
                     content,
                     Vector2(200 + self.buffer/2, 200 + self.buffer/2),
                     self.font_size,
                     self.spacing,
                     BLACK)


RESOURCES = Path(__file__).resolve().parent / "Resources"

init_window(800, 450, "Grapher")

font = load_font_ex(str(RESOURCES / "JetBrainsMono-Regular.ttf"), 36, None, 0)
set_texture_filter(font.texture, TextureFilter.TEXTURE_FILTER_BILINEAR)

while not window_should_close():
    begin_drawing()
    clear_background(WHITE)
    human = Item("Human")
    end_drawing()

unload_font(font)
close_window()
