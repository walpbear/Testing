extends SceneTree
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await create_timer(1).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("/workspace/kemono-build/menu.png")
	game.start_run()
	game.spawn_enabled = false
	for i in range(35): game.spawn_enemy(i%3, Vector2.from_angle(i * 0.6) * (120 + i * 14))
	game.basic_attack()
	game.slam()
	game.ultimate_charge = 100
	game.use_ultimate()
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("/workspace/kemono-build/game.png")
	quit()
