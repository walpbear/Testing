extends SceneTree
var checks := 0
func _initialize() -> void:
	call_deferred("run")
func check(value: bool, message: String) -> void:
	if not value:
		push_error(message)
		quit(1)
		assert(value, message)
	checks += 1
func run() -> void:
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.set_process(false)
	check(game.state == "menu", "menu starts")
	for index in range(4):
		game.select_hero(index)
		game.start_run()
		check(game.weapon == index and game.hp == game.HEROES[index].hp, "hero loadout")
		game.spawn_enabled = false
		game.spawn_enemy(0, Vector2(90, 0))
		game.auto_attack()
		for i in range(90): game.step_world(0.016)
		check(game.kills > 0, "weapon kills enemy %d" % index)
		check(game.use_skill(), "skill activates")
		check(not game.use_skill(), "skill cooldown")
	game.start_run()
	game.spawn_enabled = false
	game.spawn_enemy(2, Vector2.ZERO)
	game.step_world(0.01)
	check(game.hp < game.max_hp, "contact damage")
	var health = game.hp
	game.step_world(0.01)
	check(game.hp == health, "damage immunity")
	game.enemies.clear()
	game.gems.append({"pos":Vector2.ZERO,"value":20.0})
	game.step_world(0.01)
	check(game.state == "upgrade" and game.level == 2, "XP opens level choices")
	var old_damage = game.damage
	game.apply_upgrade("power")
	check(game.damage > old_damage and game.state == "playing", "upgrade resumes")
	var image := Image.create(4096,4096,false,Image.FORMAT_RGBA8)
	image.fill(Color("a7dcb2"))
	check(image.save_png("user://4k.png") == OK, "4K fixture")
	check(game.import_character(ProjectSettings.globalize_path("user://4k.png")), "4K import")
	var tex = game.art.texture_for("Standing", 0)
	check(tex.get_width() == 4096, "4K texture retained")
	var file := FileAccess.open("user://bad.json",FileAccess.WRITE)
	file.store_string('{"poses":{"Walk":["../outside.png"]}}')
	file.close()
	check(not game.import_character(ProjectSettings.globalize_path("user://bad.json")), "path escape rejected")
	check(game.custom, "bad import keeps previous character")
	game.hp = 0
	game.step_world(0.01)
	check(game.state == "over", "death screen")
	game.best = 42
	game.save_settings()
	game.best = 0
	game.load_settings()
	check(game.best == 42, "save reload")
	game.start_run()
	game.spawn_enabled = true
	for i in range(18000):
		if game.state == "upgrade": game.apply_upgrade("vitality")
		if game.state == "over": game.start_run()
		game.hp = game.max_hp
		game.movement = Vector2.from_angle(i * 0.01)
		game.step_world(0.016)
	check(game.enemies.size() <= 220 and game.gems.size() <= 500, "bounded simulation")
	print("PASS: %d checks including 4K import and 288 seconds simulated combat" % checks)
	game.queue_free()
	await process_frame
	quit()
