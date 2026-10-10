extends Control

signal character_clicked

var character := 0
var outfit := 0
var pose := "Standing"
var setting := 0
var light := 0
var elapsed := 0.0
var imported_texture: Texture2D
var art_bounds := Rect2(470, 172, 205, 318)
var wave_timer := 0.0

func _ready() -> void:
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	clip_contents = true

func _process(delta: float) -> void:
	elapsed += delta
	wave_timer = maxf(0, wave_timer - delta)
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var point: Vector2 = event.position / (size / Vector2(900, 550))
		if Rect2(400, 135, 330, 390).has_point(point):
			character_clicked.emit()

func block(rect: Rect2, color: Color, border := 0.0) -> void:
	if border > 0:
		draw_rect(rect.grow(border), Color("172632"))
	draw_rect(rect, color)

func _draw() -> void:
	if size.x < 1 or size.y < 1:
		return
	draw_set_transform(Vector2.ZERO, 0, size / Vector2(900, 550))
	var walls := [Color("31475b"), Color("4b445b"), Color("36534e")]
	var woods := [Color("b78768"), Color("b78b9d"), Color("c4a16e")]
	var wall: Color = walls[setting]
	var wood: Color = woods[setting]
	block(Rect2(0, 0, 900, 395), wall)
	block(Rect2(0, 395, 900, 155), Color("21323c"))
	block(Rect2(0, 385, 900, 10), wood)
	for y in range(409, 550, 35):
		draw_line(Vector2(0, y), Vector2(900, y), Color("314650"), 2)
	for x in range(0, 900, 90):
		draw_line(Vector2(x, 397), Vector2(x + 50, 550), Color("314650"), 2)
	# Window and changing sky.
	block(Rect2(65, 57, 230, 225), wood, 5)
	var sky := Color("163048") if light == 0 else Color("adcdd1")
	block(Rect2(76, 68, 208, 202), sky)
	if light == 0:
		for i in range(15):
			var sx := 87 + (i * 47) % 190
			var sy := 80 + (i * 29) % 165
			block(Rect2(sx, sy, 3, 3), Color("e4dbc8"))
		draw_circle(Vector2(235, 112), 21, Color("e4dbc8"))
		draw_circle(Vector2(245, 104), 20, sky)
	else:
		draw_circle(Vector2(235, 112), 25, Color("ffe2a1"))
	for i in range(7):
		block(Rect2(78 + i * 31, 232 - (i % 3) * 12, 25, 38 + (i % 3) * 12), Color("233d4c"))
	block(Rect2(174, 66, 8, 207), wood)
	block(Rect2(74, 165, 212, 7), wood)
	# Books and keepsakes.
	block(Rect2(742, 76, 106, 252), wood, 5)
	for shelf in range(3):
		block(Rect2(752, 86 + shelf * 79, 86, 66), Color("263844"))
		for book in range(5):
			var colors := [Color("d99a79"), Color("97b6a0"), Color("d4be87"), Color("96a7bf"), Color("c1878d")]
			block(Rect2(758 + book * 14, 105 + shelf * 79 - book % 2 * 7, 10, 40 + book % 2 * 7), colors[book])
	# Framed print.
	block(Rect2(375, 58, 104, 114), wood, 4)
	block(Rect2(384, 67, 86, 96), Color("e2d7bf"))
	draw_circle(Vector2(427, 99), 16, Color("ce8e74"))
	draw_colored_polygon(PackedVector2Array([Vector2(384, 151), Vector2(414, 112), Vector2(437, 140), Vector2(450, 120), Vector2(470, 163), Vector2(384, 163)]), Color("739083"))
	# Sofa, rug, coffee table, lamp and plant.
	block(Rect2(272, 424, 449, 87), Color("8b7272"))
	block(Rect2(285, 435, 423, 64), Color("b89c8a"))
	for stripe in range(5):
		block(Rect2(294, 444 + stripe * 10, 405, 3), Color("9d7f76"))
	block(Rect2(316, 315, 298, 106), Color("688b88"), 5)
	block(Rect2(330, 336, 130, 70), Color("789d98"), 3)
	block(Rect2(470, 336, 130, 70), Color("789d98"), 3)
	block(Rect2(301, 349, 29, 89), Color("466c6d"), 4)
	block(Rect2(600, 349, 29, 89), Color("466c6d"), 4)
	block(Rect2(324, 434, 14, 14), wood)
	block(Rect2(591, 434, 14, 14), wood)
	block(Rect2(335, 468, 125, 18), wood, 3)
	block(Rect2(347, 486, 9, 38), wood)
	block(Rect2(440, 486, 9, 38), wood)
	block(Rect2(355, 456, 17, 12), Color("ede1c7"), 2)
	draw_arc(Vector2(375, 461), 6, -1.5, 1.5, 12, Color("ede1c7"), 3)
	block(Rect2(121, 291, 66, 14), wood, 3)
	block(Rect2(130, 309, 7, 114), wood)
	block(Rect2(173, 309, 7, 114), wood)
	block(Rect2(146, 203, 7, 84), Color("dccca5"))
	draw_colored_polygon(PackedVector2Array([Vector2(117, 208), Vector2(182, 208), Vector2(169, 168), Vector2(130, 168)]), Color("e8c28d"))
	block(Rect2(788, 388, 41, 46), Color("ce977e"), 3)
	for leaf in range(6):
		var lx := 809 + (leaf % 2 * 2 - 1) * (20 + leaf * 2)
		var ly := 342 - leaf * 10
		draw_line(Vector2(809, 391), Vector2(lx, ly), Color("8fae83"), 5)
		draw_circle(Vector2(lx, ly), 13, Color("8fae83"))
	if imported_texture != null:
		var ratio := minf(art_bounds.size.x / imported_texture.get_width(), art_bounds.size.y / imported_texture.get_height())
		var dimensions := Vector2(imported_texture.get_width(), imported_texture.get_height()) * ratio
		var where := Vector2(art_bounds.get_center().x - dimensions.x / 2, art_bounds.end.y - dimensions.y)
		draw_texture_rect(imported_texture, Rect2(where, dimensions), false)
	else:
		draw_character()

func draw_character() -> void:
	var seated := pose == "Sitting"
	var bob := roundf(sin(elapsed * 2.1) * 2)
	var origin := Vector2(543, 469 if not seated else 421) + Vector2(0, bob)
	draw_set_transform(origin * (size / Vector2(900, 550)), 0, size / Vector2(900, 550))
	var fur := Color("cb946d") if character == 0 else Color("96adba")
	var jacket: Color = [Color("a0bdac"), Color("b48eae"), Color("dbad73")][outfit]
	# Fully clothed, original placeholder characters.
	draw_colored_polygon(PackedVector2Array([Vector2(45, -103), Vector2(85, -92), Vector2(91, -133), Vector2(70, -145), Vector2(77, -113)]), fur)
	block(Rect2(-40, -112, 33, 94 if not seated else 57), Color("263b50"), 3)
	block(Rect2(7, -112, 33, 94 if not seated else 57), Color("263b50"), 3)
	block(Rect2(-48, -23 if not seated else -55, 43, 23), Color("182834"), 3)
	block(Rect2(5, -23 if not seated else -55, 43, 23), Color("182834"), 3)
	block(Rect2(-52, -209, 104, 108), jacket, 4)
	block(Rect2(-12, -206, 24, 95), Color("e5ddc7"))
	block(Rect2(-2, -193, 4, 83), Color("66787e"))
	block(Rect2(-66, -193, 19, 85), jacket, 3)
	block(Rect2(-66, -112, 19, 22), fur, 3)
	if pose == "Waving" or wave_timer > 0:
		var wiggle := roundf(sin(elapsed * 8) * 5)
		block(Rect2(49, -203, 24, 58), jacket, 3)
		block(Rect2(68 + wiggle, -233, 20, 52), fur, 3)
	else:
		block(Rect2(48, -193, 19, 85), jacket, 3)
		block(Rect2(48, -112, 19, 22), fur, 3)
	block(Rect2(-21, -226, 42, 26), fur, 3)
	# Stepped ears and rounded-looking pixel face.
	draw_colored_polygon(PackedVector2Array([Vector2(-55, -288), Vector2(-46, -327), Vector2(-18, -301), Vector2(18, -301), Vector2(46, -327), Vector2(55, -288)]), Color("172632"))
	draw_colored_polygon(PackedVector2Array([Vector2(-50, -286), Vector2(-43, -316), Vector2(-20, -295), Vector2(20, -295), Vector2(43, -316), Vector2(50, -286)]), fur)
	block(Rect2(-53, -292, 106, 65), fur, 4)
	block(Rect2(-43, -227, 86, 18), fur, 3)
	block(Rect2(-33, -252, 66, 33), Color("e8dac1"))
	var blink := fmod(elapsed, 5.0) > 4.82
	block(Rect2(-32, -267, 13, 3 if blink else 13), Color("182834"))
	block(Rect2(19, -267, 13, 3 if blink else 13), Color("182834"))
	block(Rect2(-6, -247, 12, 8), Color("182834"))
	draw_line(Vector2(-9, -231), Vector2(9, -231), Color("182834"), 3)
