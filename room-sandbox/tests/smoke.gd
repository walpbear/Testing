extends SceneTree

var checks := 0

func expect(condition: bool, message: String) -> void:
	if not condition:
		push_error(message)
		quit(1)
		assert(condition, message)
	checks += 1

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.character_choice.item_selected.emit(1)
	expect(game.room.character == 1, "Character selection updates the room")
	game.outfit_choice.item_selected.emit(2)
	game.room_choice.item_selected.emit(2)
	game.light_choice.item_selected.emit(1)
	game.state["pose"] = "Sitting"
	game.apply_state()
	expect(game.room.outfit == 2 and game.room.setting == 2 and game.room.light == 1 and game.room.pose == "Sitting", "Wardrobe, pose, room and lighting propagate")
	var old_friendship: int = game.state["affection"]
	game.interact("Share tea")
	expect(game.state["affection"] == mini(999, old_friendship + 1) and game.dialogue.text.contains("quiet minute"), "Interactions change friendship and dialogue")
	game.toggle_music()
	expect(game.music_player.playing == bool(game.state["music"]), "Music control matches playback state")
	game.save_state()
	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(game.SAVE_FILE))
	expect(saved["outfit"] == 2 and saved["room"] == 2, "State is saved to disk")
	var folder := OS.get_user_data_dir().path_join("test_art")
	DirAccess.make_dir_recursive_absolute(folder)
	for index in range(3):
		var image := Image.create(4096, 4096, false, Image.FORMAT_RGBA8)
		image.fill(Color(0.2 + index * 0.1, 0.6, 0.7, 1.0))
		expect(image.save_png(folder.path_join("frame_%02d.png" % index)) == OK, "4K fixture exported")
	var manifest := {"name": "4K test character", "fps": 6, "poses": {"Standing": ["frame_00.png", "frame_01.png", "frame_02.png"], "Sitting": ["frame_01.png"]}}
	var path := folder.path_join("character.json")
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest))
	file.close()
	expect(game.import_character(path), "Animated pack imports")
	expect(game.character_choice.item_count == 3 and game.pose_choice.item_count == 2 and game.outfit_choice.disabled, "Imported controls expose its poses")
	for index in range(3):
		var texture: Texture2D = game.library.texture_for("Standing", index)
		expect(texture != null and texture.get_width() == 4096 and texture.get_height() == 4096, "Full 4K frame decoded without downsampling")
	expect(game.library.cache.size() == 2, "Frame texture cache stays bounded")
	game.state["pose"] = "Sitting"
	game.apply_state()
	expect(game.room.imported_texture != null, "Pose switching updates custom texture")
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		expect(root.get_texture().get_image().get_width() > 0, "4K artwork is rendered by the graphics driver")
	var invalid := folder.path_join("invalid.json")
	file = FileAccess.open(invalid, FileAccess.WRITE)
	file.store_string(JSON.stringify({"poses": {"Standing": ["../missing.png"]}}))
	file.close()
	expect(not game.library.open(invalid), "Invalid frame paths are rejected")
	expect(game.library.profile["name"] == "4K test character", "Failed import preserves existing character")
	game.reset_room()
	expect(game.room.imported_texture == null and game.room.character == 0, "Built-in character restores correctly")
	game.state.erase("custom_path")
	game.state["affection"] = 0
	game.state["visits"] = 1
	game.save_state()
	game.music_player.stop()
	game.music_player.stream = null
	await create_timer(0.2).timeout
	print("PASS: %d functional checks, including actual 4096x4096 PNG loading." % checks)
	game.queue_free()
	game = null
	await process_frame
	call_deferred("quit", 0)
