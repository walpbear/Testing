extends Node2D

const Art = preload("res://scripts/custom_art.gd")
const HEROES = [
	{"name":"Rowan · Fox", "species":"fox", "color":"ed9855", "weapon":0, "speed":220.0, "hp":100.0, "lore":"EMBER SCOUT   /   Fire bolts + explosive burst"},
	{"name":"Luna · Rabbit", "species":"rabbit", "color":"d5b7f2", "weapon":1, "speed":265.0, "hp":85.0, "lore":"MOON DANCER   /   Orbit blades + swift dash"},
	{"name":"Kael · Wolf", "species":"wolf", "color":"8fc7d3", "weapon":2, "speed":195.0, "hp":130.0, "lore":"FROST WARDEN   /   Frost pulse + healing howl"},
	{"name":"Yuki · Cat", "species":"cat", "color":"f1c679", "weapon":3, "speed":230.0, "hp":95.0, "lore":"STORM WEAVER   /   Lightning + thunder strike"}
]
const WEAPONS = ["Ember bolts", "Orbit blades", "Frost pulse", "Lightning"]
var hero := 0
var weapon := 0
var tint := Color("ed9855")
var art = Art.new()
var custom := false
var state := "menu"
var player := Vector2.ZERO
var hp := 100.0
var max_hp := 100.0
var speed := 220.0
var damage := 22.0
var attack_interval := 0.72
var attack_timer := 0.0
var invincible := 0.0
var skill_cooldown := 0.0
var elapsed := 0.0
var spawn_timer := 0.0
var kills := 0
var level := 1
var xp := 0.0
var xp_needed := 10.0
var best := 0
var enemies: Array[Dictionary] = []
var bolts: Array[Dictionary] = []
var gems: Array[Dictionary] = []
var effects: Array[Dictionary] = []
var upgrades := {"power":0, "haste":0, "stride":0, "vitality":0, "magnet":0, "multishot":0}
var menu: PanelContainer
var overlay: PanelContainer
var hud: Label
var notice: Label
var hero_select: OptionButton
var weapon_select: OptionButton
var color_picker: ColorPickerButton
var file_dialog: FileDialog
var rng := RandomNumberGenerator.new()
var movement := Vector2.ZERO
var orbit_timer := 0.0
var spawn_enabled := true
var facing := Vector2.RIGHT
var slash_time := 0.0
var blade_time := 0.0
var dodge_cd := 0.0
var slam_cd := 0.0
var hurt_time := 0.0
var sound_enabled := true
var sounds: Dictionary = {}
var sound_players: Array[AudioStreamPlayer] = []

func _ready() -> void:
	rng.randomize()
	load_settings()
	build_sounds()
	build_ui()
	show_menu()

func label(text_value: String, size_value := 20) -> Label:
	var node := Label.new()
	node.text = text_value
	node.add_theme_font_size_override("font_size", size_value)
	return node

func button(text_value: String, action: Callable) -> Button:
	var node := Button.new()
	node.text = text_value
	node.custom_minimum_size = Vector2(0, 46)
	node.pressed.connect(action)
	return node

func panel_at(rect: Rect2) -> PanelContainer:
	var node := PanelContainer.new()
	node.position = rect.position
	node.size = rect.size
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17252f")
	style.border_color = Color("497c78")
	style.set_border_width_all(2)
	style.set_corner_radius_all(18)
	style.content_margin_left = 28
	style.content_margin_right = 28
	style.content_margin_top = 22
	style.content_margin_bottom = 22
	node.add_theme_stylebox_override("panel", style)
	return node

func build_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	var theme := Theme.new()
	theme.default_font_size = 19
	var control := Control.new()
	control.theme = theme
	canvas.add_child(control)
	hud = label("", 22)
	hud.position = Vector2(28, 22)
	control.add_child(hud)
	notice = label("", 16)
	notice.position = Vector2(28, 754)
	control.add_child(notice)
	menu = panel_at(Rect2(650, 72, 570, 650))
	control.add_child(menu)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 13)
	menu.add_child(box)
	box.add_child(label("KEMONO SURVIVORS", 34))
	box.add_child(label("The night has no ending. Make it yours.", 17))
	hero_select = OptionButton.new()
	for h in HEROES: hero_select.add_item(h.name)
	hero_select.item_selected.connect(select_hero)
	box.add_child(hero_select)
	weapon_select = OptionButton.new()
	for w in WEAPONS: weapon_select.add_item(w)
	weapon_select.item_selected.connect(func(index): weapon = index)
	box.add_child(weapon_select)
	color_picker = ColorPickerButton.new()
	color_picker.text = "Customize fur color"
	color_picker.custom_minimum_size.y = 42
	color_picker.color_changed.connect(func(value): tint = value)
	box.add_child(color_picker)
	box.add_child(button("Import character PNG / JSON", func(): file_dialog.popup_centered_ratio(0.75)))
	box.add_child(button("Use built-in character", func(): custom = false; select_hero(hero)))
	box.add_child(button("ENTER THE NIGHT", start_run))
	box.add_child(label("WASD: move · Left click / J: slash\nRight click / K: weapon · Q: hero skill\nSpace: dodge · E: slam · Esc: pause · F11: fullscreen", 17))
	box.add_child(button("Quit", func(): get_tree().quit()))
	file_dialog = FileDialog.new()
	file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	file_dialog.filters = PackedStringArray(["*.png ; Character image", "*.json ; Character manifest"])
	file_dialog.file_selected.connect(import_character)
	control.add_child(file_dialog)
	overlay = panel_at(Rect2(390, 210, 500, 400))
	control.add_child(overlay)
	overlay.hide()
	select_hero(hero)

func select_hero(index: int) -> void:
	hero = index
	if is_instance_valid(hero_select): hero_select.select(hero)
	weapon = int(HEROES[hero].weapon)
	tint = Color(HEROES[hero].color)
	if is_instance_valid(weapon_select):
		weapon_select.select(weapon)
		color_picker.color = tint
		notice.text = HEROES[hero].lore

func import_character(path: String) -> bool:
	if not art.open(path):
		notice.text = art.last_error
		return false
	custom = true
	var settings: Variant = art.profile.get("survivor", {})
	if settings is Dictionary:
		weapon = clampi(int(settings.get("weapon", weapon)), 0, 3)
		weapon_select.select(weapon)
	notice.text = "Imported: " + str(art.profile.get("name", "Custom character")) + " · Choose any skill set and fur color."
	return true

func show_menu() -> void:
	state = "menu"
	menu.show()
	overlay.hide()
	hud.text = "BEST RUN  ·  %d defeated" % best

func start_run() -> void:
	player = Vector2.ZERO
	max_hp = float(HEROES[hero].hp)
	speed = float(HEROES[hero].speed)
	damage = 22.0
	attack_interval = 0.72
	hp = max_hp
	elapsed = 0
	kills = 0
	level = 1
	xp = 0
	xp_needed = 10
	attack_timer = 0
	spawn_timer = 0
	skill_cooldown = 0
	invincible = 0
	orbit_timer = 0
	slash_time = 0
	blade_time = 0
	dodge_cd = 0
	slam_cd = 0
	hurt_time = 0
	enemies.clear()
	bolts.clear()
	gems.clear()
	effects.clear()
	for key in upgrades: upgrades[key] = 0
	state = "playing"
	menu.hide()
	overlay.hide()
	notice.text = "LMB/J: slash  ·  RMB/K: weapon  ·  Q: hero  ·  SPACE: dodge  ·  E: slam  ·  ESC: pause"

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_F11:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
	if state == "playing":
		if event.keycode == KEY_Q: use_skill()
		if event.keycode == KEY_SPACE: dodge()
		if event.keycode == KEY_E: slam()
	if event.keycode == KEY_ESCAPE:
		if state == "playing":
			state = "paused"
			show_options("NIGHT ON HOLD", [["Resume", resume], ["Return to camp", show_menu]])
		elif state == "paused": resume()

func resume() -> void:
	state = "playing"
	overlay.hide()

func _process(delta: float) -> void:
	if state == "playing":
		movement = Vector2(float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT)), float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP))).normalized()
		var aim := get_global_mouse_position() - Vector2(640, 410)
		if aim.length() > 8: facing = aim.normalized()
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or Input.is_physical_key_pressed(KEY_J): basic_attack()
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT) or Input.is_physical_key_pressed(KEY_K): weapon_attack()
		step_world(minf(delta, 0.05))
	queue_redraw()

func step_world(dt: float) -> void:
	if state != "playing": return
	elapsed += dt
	player += movement * speed * dt
	invincible = maxf(0, invincible - dt)
	skill_cooldown = maxf(0, skill_cooldown - dt)
	attack_timer = maxf(0, attack_timer - dt)
	slash_time = maxf(0, slash_time - dt)
	blade_time = maxf(0, blade_time - dt)
	dodge_cd = maxf(0, dodge_cd - dt)
	slam_cd = maxf(0, slam_cd - dt)
	hurt_time = maxf(0, hurt_time - dt)
	spawn_timer -= dt
	orbit_timer += dt
	if spawn_enabled and spawn_timer <= 0:
		spawn_timer = maxf(0.12, 0.9 - elapsed / 450.0)
		for i in range(1 + mini(4, int(elapsed / 90))): spawn_enemy()
	for enemy in enemies:
		var distance: Vector2 = player - enemy.pos
		enemy.pos += distance.normalized() * float(enemy.speed) * (0.45 if float(enemy.get("slow", 0)) > 0 else 1.0) * dt
		enemy.flash = maxf(0, float(enemy.get("flash", 0)) - dt)
		enemy.slow = maxf(0, float(enemy.get("slow", 0)) - dt)
		if distance.length() < 27 and invincible <= 0:
			hp -= float(enemy.damage)
			hurt_time = 0.25
			play_sound("hurt")
			enemy.pos -= distance.normalized() * 35
			invincible = 0.7
		if blade_time > 0 and fmod(orbit_timer, attack_interval * 0.55) < dt and distance.length() < 100:
			hit_enemy(enemy, damage * (0.65 + mini(4, upgrades.multishot) * 0.16))
	for bolt in bolts:
		bolt.pos += bolt.velocity * dt
		bolt.life -= dt
		for enemy in enemies:
			if float(enemy.hp) > 0 and (bolt.pos as Vector2).distance_to(enemy.pos) < float(enemy.radius) + 8 and bolt.life > 0:
				hit_enemy(enemy, float(bolt.damage))
				bolt.life = 0
	for i in range(enemies.size()-1, -1, -1):
		if enemies[i].hp <= 0:
			gems.append({"pos":enemies[i].pos, "value":3.0 if enemies[i].elite else 1.0})
			kills += 1
			play_sound("defeat")
			enemies.remove_at(i)
	bolts = bolts.filter(func(b): return b.life > 0)
	for i in range(gems.size()-1, -1, -1):
		var distance: float = player.distance_to(gems[i].pos)
		if distance < 95 + upgrades.magnet * 45:
			gems[i].pos = (gems[i].pos as Vector2).move_toward(player, 340 * dt)
		if distance < 22:
			xp += float(gems[i].value)
			play_sound("pickup")
			gems.remove_at(i)
	for effect in effects: effect.life -= dt
	effects = effects.filter(func(e): return e.life > 0)
	if gems.size() > 500:
		gems[0].value += gems.back().value
		gems.pop_back()
	if hp <= 0: end_run()
	elif xp >= xp_needed:
		xp -= xp_needed
		level += 1
		xp_needed = 8 + level * 5
		show_level_up()
	hud.text = "HP %d / %d     LEVEL %d     XP %d / %d     %02d:%02d     KILLS %d\n%s   ·   Skill %s" % [maxi(0, int(hp)), int(max_hp), level, int(xp), int(xp_needed), int(elapsed)/60, int(elapsed)%60, kills, WEAPONS[weapon], "READY" if skill_cooldown <= 0 else "%ds" % int(ceil(skill_cooldown))]
	hud.text += "   Dodge: %s   Slam: %s" % ["READY" if dodge_cd <= 0 else "%.1fs" % dodge_cd, "READY" if slam_cd <= 0 else "%.1fs" % slam_cd]

func spawn_enemy(kind := -1, at := Vector2.INF) -> void:
	if enemies.size() >= 220: return
	if kind < 0: kind = rng.randi_range(0, 2)
	if at == Vector2.INF: at = player + Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(680, 830)
	var elite := elapsed > 60 and rng.randf() < 0.045
	var growth := 1.0 + elapsed / 180.0
	enemies.append({"pos":at, "kind":kind, "hp":float([36, 25, 30][kind]) * growth * (4 if elite else 1), "speed":float([52, 75, 95][kind]) + minf(75, elapsed / 10), "damage":float([12, 9, 15][kind]) * (2 if elite else 1), "radius":28.0 if elite else 18.0, "elite":elite, "max_hp":float([36, 25, 30][kind]) * growth * (4 if elite else 1), "flash":0.0})

func nearest_enemy() -> int:
	var selected := -1
	var distance := 700.0
	for i in enemies.size():
		var current: float = player.distance_to(enemies[i].pos)
		if current < distance and enemies[i].hp > 0:
			distance = current
			selected = i
	return selected

func auto_attack() -> void:
	var target := nearest_enemy()
	if target < 0: return
	if weapon == 0:
		var direction: Vector2 = (enemies[target].pos - player).normalized()
		for i in range(1 + mini(4, upgrades.multishot)):
			bolts.append({"pos":player, "velocity":direction.rotated((i - upgrades.multishot * 0.5) * 0.12) * 530, "life":1.4, "damage":damage})
	elif weapon == 2:
		area_damage(175 + upgrades.multishot * 15, damage, Color("89e9ed"))
		for enemy in enemies:
			if player.distance_to(enemy.pos) < 175 + upgrades.multishot * 15: enemy.slow = 1.2
	elif weapon == 3:
		var used: Array[int] = []
		for i in range(1 + mini(4, upgrades.multishot)):
			var picked := -1
			var distance := 620.0
			for j in enemies.size():
				var d: float = player.distance_to(enemies[j].pos)
				if j not in used and d < distance:
					picked = j
					distance = d
			if picked >= 0:
				used.append(picked)
				hit_enemy(enemies[picked], damage * 1.4)
				effects.append({"pos":enemies[picked].pos, "from":player, "radius":18.0, "color":Color("f5dd85"), "life":0.22})

func area_damage(radius: float, amount: float, color_value: Color) -> void:
	for enemy in enemies:
		if player.distance_to(enemy.pos) < radius: hit_enemy(enemy, amount)
	effects.append({"pos":player, "radius":radius, "color":color_value, "life":0.35})

func use_skill() -> bool:
	if state != "playing" or skill_cooldown > 0: return false
	play_sound("skill")
	skill_cooldown = [9.0, 5.0, 12.0, 10.0][hero]
	match hero:
		0: area_damage(280, damage * 4, Color("ff9765"))
		1:
			player += (movement if movement.length() > 0 else Vector2.RIGHT) * 190
			invincible = 1.1
			area_damage(130, damage * 3, Color("d7b2ff"))
		2:
			hp = minf(max_hp, hp + max_hp * 0.3)
			area_damage(220, damage * 2, Color("90e8e6"))
		3: area_damage(480, damage * 3, Color("ffe7a1"))
	return true

func show_options(title_value: String, choices: Array) -> void:
	for child in overlay.get_children():
		overlay.remove_child(child)
		child.queue_free()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	overlay.add_child(box)
	box.add_child(label(title_value, 27))
	for choice in choices: box.add_child(button(choice[0], choice[1]))
	overlay.show()

func show_level_up() -> void:
	state = "upgrade"
	play_sound("level")
	var keys: Array = upgrades.keys()
	keys.shuffle()
	var descriptions := {"power":"Power  ·  +25% damage", "haste":"Haste  ·  faster attacks", "stride":"Stride  ·  +20 movement speed", "vitality":"Vitality  ·  +20 health + heal", "magnet":"Magnet  ·  wider crystal pickup", "multishot":"Mastery  ·  more bolts / blades / reach"}
	var choices := []
	for key in keys.slice(0, 3): choices.append([descriptions[key], apply_upgrade.bind(key)])
	show_options("LEVEL %d  ·  Choose a boon" % level, choices)

func apply_upgrade(key: String) -> void:
	if not upgrades.has(key): return
	upgrades[key] += 1
	match key:
		"power": damage *= 1.25
		"haste": attack_interval = maxf(0.16, attack_interval * 0.86)
		"stride": speed += 20
		"vitality":
			max_hp += 20
			hp = minf(max_hp, hp + 40)
	resume()

func end_run() -> void:
	state = "over"
	best = maxi(best, kills)
	save_settings()
	show_options("DAWN WILL REMEMBER", [["%d kills · Level %d · %02d:%02d" % [kills, level, int(elapsed)/60, int(elapsed)%60], func(): pass], ["Try again", start_run], ["Return to camp", show_menu]])

func save_settings() -> void:
	var file := FileAccess.open("user://survivors-save.json", FileAccess.WRITE)
	if file: file.store_string(JSON.stringify({"best":best, "hero":hero}))

func load_settings() -> void:
	if not FileAccess.file_exists("user://survivors-save.json"): return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://survivors-save.json"))
	if parsed is Dictionary:
		best = maxi(0, int(parsed.get("best", 0)))
		hero = clampi(int(parsed.get("hero", 0)), 0, 3)

func screen_pos(world: Vector2) -> Vector2:
	return world - player + Vector2(640, 410)

func _draw() -> void:
	draw_rect(Rect2(0, 0, 1280, 800), Color("101e26"))
	var offset := Vector2(fposmod(-player.x, 80), fposmod(-player.y, 80))
	for x in range(-1, 17):
		for y in range(-1, 12):
			var p := Vector2(x * 80, y * 80) + offset
			draw_line(p, p + Vector2(80, 0), Color("192d32"), 1)
			draw_circle(p + Vector2(20, 38), 2, Color("25483f"))
	for x in range(-2, 4):
		for y in range(-2, 4):
			var p := screen_pos(Vector2(x * 520 + 170, y * 430 + 100))
			draw_rect(Rect2(p, Vector2(35, 48)), Color("32434a"))
			draw_line(p + Vector2(17, 8), p + Vector2(17, 32), Color("617a78"), 3)
			draw_line(p + Vector2(8, 18), p + Vector2(26, 18), Color("617a78"), 3)
	if state == "menu":
		draw_circle(Vector2(300, 380), 185, Color("203c3e"))
		draw_arc(Vector2(300, 380), 198, 0, TAU, 64, Color("668e77"), 2)
		draw_hero(Vector2(300, 400), 3.4)
		draw_string(ThemeDB.fallback_font, Vector2(145, 655), "YOUR HERO. YOUR BUILD.", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("c5e0c9"))
		return
	for gem in gems:
		var p := screen_pos(gem.pos)
		draw_colored_polygon(PackedVector2Array([p+Vector2(0,-7),p+Vector2(5,0),p+Vector2(0,7),p+Vector2(-5,0)]), Color("71e6b0"))
	for enemy in enemies: draw_enemy(screen_pos(enemy.pos), enemy)
	for bolt in bolts:
		draw_circle(screen_pos(bolt.pos), 7, Color("f49e56"))
		draw_circle(screen_pos(bolt.pos), 3, Color("fff0b2"))
	for effect in effects:
		var c: Color = effect.color
		c.a = minf(1, float(effect.life) * 3)
		var p := screen_pos(effect.pos)
		draw_arc(p, effect.radius, 0, TAU, 48, c, 4)
		if effect.has("from"): draw_line(screen_pos(effect.from), p, c, 4)
		if effect.has("damage"):
			draw_string(ThemeDB.fallback_font, p + Vector2(-12, -35 - (0.5 - float(effect.life)) * 55), str(int(effect.damage)), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color("fff0c4"))
			for j in range(5): draw_line(p + Vector2.from_angle(j * TAU/5) * 12, p + Vector2.from_angle(j * TAU/5) * 23, c, 2)
	if blade_time > 0:
		for i in range(2 + mini(4, upgrades.multishot)):
			var p := Vector2(640, 410) + Vector2.from_angle(orbit_timer * 3 + i * TAU / (2 + mini(4, upgrades.multishot))) * 80
			draw_line(p - Vector2(8, 12), p + Vector2(8, 12), Color("dad7ff"), 6)
	if slash_time > 0:
		var angle := facing.angle()
		draw_arc(Vector2(640,410), 85, angle - 0.85, angle + 0.85, 24, Color("f9e5b2"), 8)
		draw_arc(Vector2(640,410), 100, angle - 0.6, angle + 0.6, 20, Color("91e8d3"), 3)
	if hurt_time > 0: draw_rect(Rect2(0,0,1280,800), Color(0.8,0.15,0.12,hurt_time * 0.32))
	if invincible <= 0 or int(elapsed * 12) % 2 == 0: draw_hero(Vector2(640, 410), 1)
	draw_rect(Rect2(25, 106, 400, 7), Color("294743"))
	draw_rect(Rect2(25, 106, 400 * minf(1, xp / xp_needed), 7), Color("7ee8b1"))

func draw_hero(p: Vector2, scale_value: float) -> void:
	draw_circle(p + Vector2(0, 26 * scale_value), 22 * scale_value, Color(0,0,0,0.25))
	if custom:
		var poses := art.pose_names()
		var pose: String = str(poses[0])
		if "Walk" in poses and movement.length() > 0: pose = "Walk"
		var texture: Texture2D = art.texture_for(pose, int(elapsed * clampf(float(art.profile.get("fps", 8)), 1, 30)))
		if texture:
			var dimensions := texture.get_size()
			var fit := Vector2(76, 90) * scale_value
			var ratio := minf(fit.x / dimensions.x, fit.y / dimensions.y)
			var size_value := dimensions * ratio
			draw_texture_rect(texture, Rect2(p + Vector2(0, 8 * scale_value) - size_value / 2, size_value), false)
			return
	var s := scale_value
	var species: String = HEROES[hero].species
	draw_line(p + Vector2(11, 13) * s, p + Vector2(33, 0) * s, tint.darkened(0.2), 13 * s)
	draw_rect(Rect2(p + Vector2(-13, 24)*s, Vector2(10, 16)*s), Color("101a29"))
	draw_rect(Rect2(p + Vector2(3, 24)*s, Vector2(10, 16)*s), Color("101a29"))
	draw_rect(Rect2(p + Vector2(-20, -1)*s, Vector2(40, 30)*s), Color("426b66"))
	draw_line(p + Vector2(-23, 3)*s, p + Vector2(-25, 20)*s, tint, 9*s)
	draw_line(p + Vector2(23, 3)*s, p + Vector2(25, 20)*s, tint, 9*s)
	draw_circle(p + Vector2(0, -18)*s, 23*s, tint)
	# Cheek tufts, fluffy chest, hair fringe and contrasting ear tips.
	for side in [-1, 1]:
		draw_colored_polygon(PackedVector2Array([p+Vector2(side*17,-23)*s,p+Vector2(side*29,-16)*s,p+Vector2(side*21,-10)*s,p+Vector2(side*26,-4)*s,p+Vector2(side*13,-8)*s]), tint)
	draw_colored_polygon(PackedVector2Array([p+Vector2(-10,-1)*s,p+Vector2(0,11)*s,p+Vector2(10,-1)*s]),Color("eee1c7"))
	for i in range(3):
		draw_colored_polygon(PackedVector2Array([p+Vector2(-14+i*10,-39)*s,p+Vector2(-5+i*10,-39)*s,p+Vector2(-10+i*10,-27)*s]),tint.darkened(0.18))
	var ear_height := 45 if species == "rabbit" else 28
	for side in [-1, 1]:
		var base := p + Vector2(side * 15, -31)*s
		draw_colored_polygon(PackedVector2Array([base+Vector2(-9,5)*s,base+Vector2(side*3,-ear_height)*s,base+Vector2(9,5)*s]), tint)
		draw_line(base, base + Vector2(side*2, -ear_height+9)*s, Color("e9bdba"), 5*s)
	draw_circle(p + Vector2(0,-10)*s, 12*s, Color("eee1c7"))
	for side in [-1,1]:
		draw_rect(Rect2(p+Vector2(side*11-3,-22)*s,Vector2(6,8)*s),Color("172633"))
		draw_rect(Rect2(p+Vector2(side*11-2,-22)*s,Vector2(2,3)*s),Color.WHITE)
	draw_colored_polygon(PackedVector2Array([p+Vector2(-4,-13)*s,p+Vector2(4,-13)*s,p+Vector2(0,-9)*s]),Color("2b2632"))
	draw_line(p + Vector2(-20,-1)*s,p+Vector2(17,8)*s,Color("d5a451"),6*s)
	draw_circle(p+Vector2(0,14)*s,4*s,Color("e5c071"))

func draw_enemy(p: Vector2, enemy: Dictionary) -> void:
	var s := 1.45 if enemy.elite else 1.0
	draw_circle(p + Vector2(0, 17)*s, 18*s, Color(0,0,0,0.24))
	match int(enemy.kind):
		0:
			draw_rect(Rect2(p+Vector2(-14,-2)*s,Vector2(28,29)*s),Color("75657d"))
			draw_rect(Rect2(p+Vector2(-14,-24)*s,Vector2(28,25)*s),Color("85a77b"))
			draw_line(p+Vector2(-18,2)*s,p+Vector2(-26,12)*s,Color("85a77b"),7*s)
			draw_line(p+Vector2(18,2)*s,p+Vector2(26,12)*s,Color("85a77b"),7*s)
		1:
			draw_circle(p+Vector2(0,3)*s,19*s,Color("6bc2a1"))
			draw_rect(Rect2(p+Vector2(-20,3)*s,Vector2(40,16)*s),Color("6bc2a1"))
			draw_circle(p+Vector2(-6,-5)*s,5*s,Color("b6edd1"))
		2:
			draw_line(p+Vector2(0,-6)*s,p+Vector2(0,20)*s,Color("dfd6b5"),5*s)
			for y in [0,7,14]: draw_line(p+Vector2(-12,y)*s,p+Vector2(12,y)*s,Color("dfd6b5"),3*s)
			draw_circle(p+Vector2(0,-17)*s,14*s,Color("dfd6b5"))
			draw_line(p+Vector2(-8,18)*s,p+Vector2(-13,29)*s,Color("dfd6b5"),4*s)
			draw_line(p+Vector2(8,18)*s,p+Vector2(13,29)*s,Color("dfd6b5"),4*s)
	var eye_y := 2 if enemy.kind == 1 else -19
	for side in [-1,1]: draw_circle(p+Vector2(side*6,eye_y)*s,3*s,Color("342635"))
	if enemy.elite: draw_arc(p,36,0,TAU,24,Color("ed8d6b"),2)

	if enemy.hp < enemy.max_hp:
		draw_rect(Rect2(p+Vector2(-20,-42)*s,Vector2(40,4)*s),Color("402735"))
		draw_rect(Rect2(p+Vector2(-20,-42)*s,Vector2(40*maxf(0,enemy.hp/enemy.max_hp),4)*s),Color("dc7c86"))
	if float(enemy.get("flash", 0)) > 0:
		draw_circle(p, 24*s, Color(1,0.95,0.8,0.6))

func basic_attack() -> bool:
	if state != "playing" or attack_timer > 0: return false
	attack_timer = attack_interval * 0.55
	slash_time = 0.18
	play_sound("slash")
	for enemy in enemies:
		var toward: Vector2 = enemy.pos - player
		if toward.length() < 112 and (toward.length() < 35 or facing.dot(toward.normalized()) > 0.45): hit_enemy(enemy, damage * 1.3)
	return true

func weapon_attack() -> bool:
	if state != "playing" or attack_timer > 0: return false
	attack_timer = attack_interval
	play_sound("weapon")
	if weapon == 1: blade_time = 2.0
	elif weapon == 0:
		for i in range(1 + mini(4, upgrades.multishot)):
			bolts.append({"pos":player,"velocity":facing.rotated((i-mini(4,upgrades.multishot)*0.5)*0.12)*530,"life":1.4,"damage":damage})
	else: auto_attack()
	return true

func dodge() -> bool:
	if state != "playing" or dodge_cd > 0: return false
	dodge_cd = 2.8
	invincible = 0.6
	player += (movement if movement.length() > 0 else facing) * 155
	play_sound("slash")
	effects.append({"pos":player,"radius":40.0,"color":Color("9de4cd"),"life":0.3})
	return true

func slam() -> bool:
	if state != "playing" or slam_cd > 0: return false
	slam_cd = 5.0
	play_sound("skill")
	area_damage(190,damage*2.5,Color("e7b773"))
	return true

func hit_enemy(enemy: Dictionary, amount: float) -> void:
	if enemy.hp <= 0: return
	enemy.hp -= amount
	enemy.flash = 0.14
	enemy.pos += (enemy.pos - player).normalized() * 17
	effects.append({"pos":enemy.pos,"radius":13.0,"color":Color("ffd09b"),"life":0.5,"damage":amount})
	play_sound("hit")

func build_sounds() -> void:
	for name_value in ["slash","weapon","hit","hurt","skill","defeat","pickup","level"]:
		var length := 0.3 if name_value in ["skill","level"] else 0.10
		var base: float = {"slash":180,"weapon":470,"hit":120,"hurt":90,"skill":260,"defeat":160,"pickup":1000,"level":660}[name_value]
		var samples := PackedByteArray()
		samples.resize(int(22050 * length) * 2)
		for i in range(samples.size()/2):
			var t := float(i)/22050
			var envelope := pow(1.0-t/length,2)
			var frequency := base * (1.0+t*2 if name_value in ["pickup","level"] else 1.0-t/length*0.5)
			var value := sin(TAU*frequency*t)
			if name_value in ["slash","hit","hurt"]: value = value*0.4 + rng.randf_range(-0.6,0.6)
			samples.encode_s16(i*2,int(value*envelope*9500))
		var stream := AudioStreamWAV.new()
		stream.format = AudioStreamWAV.FORMAT_16_BITS
		stream.mix_rate = 22050
		stream.data = samples
		sounds[name_value] = stream
	for i in range(12):
		var node := AudioStreamPlayer.new()
		node.volume_db = -14
		add_child(node)
		sound_players.append(node)

func play_sound(name_value: String) -> void:
	if not sound_enabled or not sounds.has(name_value): return
	for node in sound_players:
		if not node.playing:
			node.stream = sounds[name_value]
			node.play()
			return
