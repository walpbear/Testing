extends Control

const RoomScene = preload("res://scripts/room_view.gd")
const ArtLibrary = preload("res://scripts/custom_art.gd")
const SAVE_FILE := "user://room_company_save.json"
const NAMES := ["Rowan", "Mika"]
const OUTFITS := ["Sage jacket", "Plum jacket", "Honey jacket"]
const POSES := ["Standing", "Sitting", "Waving"]
const ROOMS := ["City loft", "Velvet evening", "Garden studio"]
const ACCENT := Color("edc59c")

var state := {"character": 0, "outfit": 0, "pose": "Standing", "room": 0, "light": 0, "visits": 1, "affection": 0, "music": false}
var room: Control
var library = ArtLibrary.new()
var character_choice: OptionButton
var outfit_choice: OptionButton
var pose_choice: OptionButton
var room_choice: OptionButton
var light_choice: OptionButton
var subtitle: Label
var dialogue: Label
var speaker: Label
var status: Label
var art_note: Label
var import_dialog: FileDialog
var animation_clock := 0.0
var current_frame := -1
var chat_index := 0
var music_player: AudioStreamPlayer
var music_button: Button
var ui_ready := false

func _ready() -> void:
	load_state()
	build_interface()
	build_music()
	ui_ready = true
	apply_state()
	if bool(state.get("restore_custom", false)) and not str(state.get("custom_path", "")).is_empty():
		var saved_pose := str(state.get("custom_pose", "Standing"))
		if import_character(str(state["custom_path"])) and library.pose_names().has(saved_pose):
			state["pose"] = saved_pose
			apply_state()
	if bool(state["music"]):
		music_player.play()
	say("Welcome back. Make yourself comfortable—this room is yours.")
	save_state()

func panel_style(color: Color, border := Color("304251")) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 15
	style.content_margin_bottom = 15
	return style

func text_label(text: String, font_size := 16, color := Color("d6dfdf")) -> Label:
	var result := Label.new()
	result.text = text
	result.add_theme_font_size_override("font_size", font_size)
	result.add_theme_color_override("font_color", color)
	return result

func button(text: String, action: Callable) -> Button:
	var result := Button.new()
	result.text = text
	result.custom_minimum_size.y = 40
	result.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	result.pressed.connect(action)
	return result

func select_row(parent: VBoxContainer, title: String, values: Array, callback: Callable) -> OptionButton:
	var row := HBoxContainer.new()
	var label := text_label(title, 13, Color("92a6b3"))
	label.custom_minimum_size.x = 64
	row.add_child(label)
	var result := OptionButton.new()
	result.custom_minimum_size.y = 39
	result.size_flags_horizontal = SIZE_EXPAND_FILL
	for value: Variant in values:
		result.add_item(str(value))
	result.item_selected.connect(callback)
	row.add_child(result)
	parent.add_child(row)
	return result

func build_interface() -> void:
	var background := ColorRect.new()
	background.color = Color("101923")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(background)
	var theme := Theme.new()
	theme.default_font_size = 16
	for kind in ["Button", "OptionButton"]:
		for state_name in ["normal", "hover", "pressed", "focus"]:
			var color: Color = {"normal": Color("253544"), "hover": Color("354b5b"), "pressed": Color("455f6a"), "focus": Color(0, 0, 0, 0)}[state_name]
			var box := panel_style(color, Color("304251") if state_name == "normal" else ACCENT)
			box.content_margin_top = 5
			box.content_margin_bottom = 5
			box.content_margin_left = 12
			box.content_margin_right = 12
			theme.set_stylebox(state_name, kind, box)
		theme.set_color("font_color", kind, Color("edf0e9"))
	self.theme = theme
	var margins := MarginContainer.new()
	margins.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margins.add_theme_constant_override("margin_" + side, 20)
	add_child(margins)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 15)
	margins.add_child(layout)
	var header := HBoxContainer.new()
	layout.add_child(header)
	var title_box := VBoxContainer.new()
	title_box.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title_box)
	title_box.add_child(text_label("ROOM & COMPANY", 30, ACCENT))
	subtitle = text_label("A small room. A little company. Your own pace.", 14, Color("92a6b3"))
	title_box.add_child(subtitle)
	header.add_child(button("Fullscreen · F11", toggle_fullscreen))
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 18)
	layout.add_child(middle)
	var stage := PanelContainer.new()
	stage.add_theme_stylebox_override("panel", panel_style(Color("263844")))
	stage.size_flags_horizontal = SIZE_EXPAND_FILL
	middle.add_child(stage)
	room = RoomScene.new()
	room.custom_minimum_size = Vector2(650, 360)
	room.size_flags_vertical = SIZE_EXPAND_FILL
	room.character_clicked.connect(func(): interact("Wave"))
	stage.add_child(room)
	var inspector := PanelContainer.new()
	inspector.custom_minimum_size.x = 310
	inspector.add_theme_stylebox_override("panel", panel_style(Color("1a2734")))
	middle.add_child(inspector)
	var choices := VBoxContainer.new()
	choices.add_theme_constant_override("separation", 8)
	inspector.add_child(choices)
	choices.add_child(text_label("Make it yours", 22, ACCENT))
	character_choice = select_row(choices, "Company", NAMES, func(index): select_character(index))
	outfit_choice = select_row(choices, "Outfit", OUTFITS, func(index): state["outfit"] = index; apply_state(); save_state())
	pose_choice = select_row(choices, "Pose", POSES, func(index): state["pose"] = pose_choice.get_item_text(index); current_frame = -1; apply_state(); save_state())
	room_choice = select_row(choices, "Room", ROOMS, func(index): state["room"] = index; apply_state(); save_state())
	light_choice = select_row(choices, "Lighting", ["Moonlit", "Daylight"], func(index): state["light"] = index; apply_state(); save_state())
	choices.add_child(button("Import your character…", func(): import_dialog.popup_centered_ratio(0.75)))
	art_note = text_label("Use a PNG or an animated character pack.", 12, Color("92a6b3"))
	art_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	choices.add_child(art_note)
	var footer := PanelContainer.new()
	footer.add_theme_stylebox_override("panel", panel_style(Color("1a2734")))
	layout.add_child(footer)
	var dialogue_box := VBoxContainer.new()
	dialogue_box.add_theme_constant_override("separation", 8)
	footer.add_child(dialogue_box)
	speaker = text_label("ROWAN", 13, ACCENT)
	dialogue_box.add_child(speaker)
	dialogue = text_label("", 17)
	dialogue.custom_minimum_size.y = 40
	dialogue.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialogue_box.add_child(dialogue)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	dialogue_box.add_child(actions)
	for action in ["Chat", "Wave", "Share tea"]:
		var item := button(action, interact.bind(action))
		item.size_flags_horizontal = SIZE_EXPAND_FILL
		actions.add_child(item)
	music_button = button("Music: off", toggle_music)
	music_button.size_flags_horizontal = SIZE_EXPAND_FILL
	actions.add_child(music_button)
	var bottom := HBoxContainer.new()
	layout.add_child(bottom)
	status = text_label("", 12, Color("92a6b3"))
	status.size_flags_horizontal = SIZE_EXPAND_FILL
	bottom.add_child(status)
	bottom.add_child(button("4K window", func(): DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED); DisplayServer.window_set_size(Vector2i(3840, 2160))))
	bottom.add_child(button("Reset room", reset_room))
	import_dialog = FileDialog.new()
	import_dialog.access = FileDialog.ACCESS_FILESYSTEM
	import_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	import_dialog.filters = PackedStringArray(["*.json ; Character pack", "*.png ; Character image"])
	import_dialog.title = "Choose your character artwork"
	import_dialog.file_selected.connect(import_character)
	add_child(import_dialog)

func select_character(index: int) -> void:
	state["character"] = index
	pose_choice.clear()
	var options: Array = library.pose_names() if index == 2 else POSES
	for item: Variant in options:
		pose_choice.add_item(str(item))
	state["pose"] = str(options[0])
	current_frame = -1
	apply_state()
	say("It's good to see you. What shall we do today?")
	save_state()

func import_character(path: String) -> bool:
	if not library.open(path):
		say(library.last_error, "ARTWORK")
		return false
	if character_choice.item_count == 2:
		character_choice.add_item(str(library.profile.get("name", "Your character")))
	else:
		character_choice.set_item_text(2, str(library.profile.get("name", "Your character")))
	select_character(2)
	state["custom_path"] = path
	save_state()
	art_note.text = "Imported artwork keeps its original colors. Each frame fits the same character area."
	return true

func apply_state() -> void:
	if not ui_ready:
		return
	room.character = int(state["character"])
	room.outfit = int(state["outfit"])
	room.pose = str(state["pose"])
	room.setting = int(state["room"])
	room.light = int(state["light"])
	character_choice.select(int(state["character"]))
	outfit_choice.select(int(state["outfit"]))
	outfit_choice.disabled = int(state["character"]) == 2
	room_choice.select(int(state["room"]))
	light_choice.select(int(state["light"]))
	for index in pose_choice.item_count:
		if pose_choice.get_item_text(index) == str(state["pose"]):
			pose_choice.select(index)
	if int(state["character"]) != 2:
		room.imported_texture = null
	else:
		update_custom_frame(true)
	music_button.text = "Music: on" if bool(state["music"]) else "Music: off"
	status.text = "Visit %d   ·   Friendship %d   ·   Saved automatically   ·   Click your companion to wave" % [int(state["visits"]), int(state["affection"])]
	room.queue_redraw()

func say(line: String, who := "") -> void:
	var name: String = str(library.profile.get("name", "Your character")) if int(state["character"]) == 2 else NAMES[int(state["character"])]
	speaker.text = name.to_upper() if who.is_empty() else who
	dialogue.text = line

func interact(action: String) -> void:
	state["affection"] = mini(999, int(state["affection"]) + 1)
	match action:
		"Chat":
			var lines := ["I like the little things: warm light, a favorite book, and good company.", "What would your perfect afternoon look like? Mine definitely includes this sofa.", "We don't have to do anything special. Sometimes just being here is enough.", "The room feels different every time you change the light. Try the garden colors!"]
			say(lines[chat_index % lines.size()])
			chat_index += 1
		"Wave":
			room.wave_timer = 2.5
			say("Hey, you. Nice to see a friendly face.")
		"Share tea":
			say("Thank you. Let's take a quiet minute and enjoy this together.")
	apply_state()
	save_state()

func _process(delta: float) -> void:
	if not ui_ready or int(state["character"]) != 2:
		return
	animation_clock += delta
	update_custom_frame()

func update_custom_frame(force := false) -> void:
	var fps := clampf(float(library.profile.get("fps", 6)), 0.2, 30)
	var count: int = library.frame_count(str(state["pose"]))
	if count == 0:
		return
	var frame := int(animation_clock * fps) % count
	if force or frame != current_frame:
		current_frame = frame
		room.imported_texture = library.texture_for(str(state["pose"]), frame)
		if room.imported_texture == null:
			say(library.last_error, "ARTWORK")

func toggle_fullscreen() -> void:
	var fullscreen := DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if fullscreen else DisplayServer.WINDOW_MODE_FULLSCREEN)

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F11:
			toggle_fullscreen()
		elif event.keycode == KEY_ESCAPE:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_size(Vector2i(1280, 800))

func build_music() -> void:
	music_player = AudioStreamPlayer.new()
	add_child(music_player)
	var sample_rate := 22050
	var length := sample_rate * 8
	var bytes := PackedByteArray()
	bytes.resize(length * 2)
	var chords := [[130.81, 164.81, 196.0], [110.0, 130.81, 164.81], [87.31, 130.81, 174.61], [98.0, 146.83, 196.0]]
	for index in length:
		var time := float(index) / sample_rate
		var chord: Array = chords[int(time / 2) % 4]
		var envelope := sin(PI * fmod(time, 2.0) / 2.0)
		var value := 0.0
		for frequency: float in chord:
			value += sin(TAU * frequency * time) * 0.08 * envelope
		bytes.encode_s16(index * 2, int(value * 32767))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = length
	stream.data = bytes
	music_player.stream = stream
	music_player.volume_db = -14

func toggle_music() -> void:
	state["music"] = not bool(state["music"])
	if bool(state["music"]):
		music_player.play()
	else:
		music_player.stop()
	apply_state()
	save_state()

func load_state() -> void:
	if not FileAccess.file_exists(SAVE_FILE):
		return
	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE_FILE))
	if not saved is Dictionary:
		return
	for key in ["outfit", "room", "light", "visits", "affection"]:
		if saved.get(key) is float or saved.get(key) is int:
			state[key] = int(saved[key])
	state["character"] = clampi(int(saved.get("character", 0)), 0, 1)
	state["outfit"] = clampi(int(state["outfit"]), 0, 2)
	state["room"] = clampi(int(state["room"]), 0, 2)
	state["light"] = clampi(int(state["light"]), 0, 1)
	state["affection"] = clampi(int(state["affection"]), 0, 999)
	state["visits"] = maxi(1, int(state["visits"])) + 1
	state["pose"] = str(saved.get("pose", "Standing")) if POSES.has(saved.get("pose")) else "Standing"
	state["music"] = bool(saved.get("music", false))
	state["custom_path"] = str(saved.get("custom_path", ""))
	state["restore_custom"] = int(saved.get("character", 0)) == 2
	state["custom_pose"] = str(saved.get("pose", "Standing"))

func save_state() -> void:
	var file := FileAccess.open(SAVE_FILE + ".tmp", FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(state))
	file.close()
	DirAccess.rename_absolute(SAVE_FILE + ".tmp", SAVE_FILE)

func reset_room() -> void:
	state.erase("custom_path")
	state["restore_custom"] = false
	state["outfit"] = 0
	state["room"] = 0
	state["light"] = 0
	state["music"] = false
	music_player.stop()
	select_character(0)
	say("A fresh start. Let's make this place feel like home.")
