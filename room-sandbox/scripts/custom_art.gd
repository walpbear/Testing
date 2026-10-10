extends RefCounted

# Runtime images stay external; frame textures are cached in a two-entry window.
var profile: Dictionary = {}
var root_dir := ""
var cache: Dictionary = {}
var cache_order: Array[String] = []
var last_error := ""

func open(path: String) -> bool:
	last_error = ""
	var candidate: Dictionary
	if path.get_extension().to_lower() == "png":
		candidate = {"name": path.get_file().get_basename(), "poses": {"Standing": [path.get_file()]}, "fps": 6.0}
	else:
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if not parsed is Dictionary:
			last_error = "Choose a PNG or a valid character JSON file."
			return false
		candidate = parsed
	var poses: Variant = candidate.get("poses", {})
	if not poses is Dictionary or poses.is_empty():
		last_error = "The character needs at least one pose."
		return false
	var directory := path.get_base_dir().simplify_path()
	for pose: Variant in poses:
		var frames: Variant = poses[pose]
		if not frames is Array or frames.is_empty() or frames.size() > 64:
			last_error = "Each pose needs between 1 and 64 separate PNG frames."
			return false
		for frame: Variant in frames:
			if not frame is String or frame.is_absolute_path():
				last_error = "Use relative PNG paths inside the character folder."
				return false
			var resolved := directory.path_join(frame).simplify_path()
			if not resolved.begins_with(directory + "/") or not FileAccess.file_exists(resolved) or resolved.get_extension().to_lower() != "png":
				last_error = "A frame is missing or outside the character folder: " + str(frame)
				return false
	var first_pose: String = str(poses.keys()[0])
	var probe := Image.new()
	if probe.load(directory.path_join(str(poses[first_pose][0]))) != OK:
		last_error = "The first frame could not be opened."
		return false
	profile = candidate
	root_dir = directory
	cache.clear()
	cache_order.clear()
	return true

func pose_names() -> Array:
	return profile.get("poses", {}).keys()

func frame_count(pose: String) -> int:
	return profile.get("poses", {}).get(pose, []).size()

func texture_for(pose: String, index: int) -> Texture2D:
	var frames: Array = profile.get("poses", {}).get(pose, [])
	if frames.is_empty():
		return null
	var path := root_dir.path_join(str(frames[posmod(index, frames.size())])).simplify_path()
	if cache.has(path):
		return cache[path]
	var image := Image.new()
	if image.load(path) != OK:
		last_error = "Could not load frame: " + path.get_file()
		return null
	var texture := ImageTexture.create_from_image(image)
	cache[path] = texture
	cache_order.append(path)
	while cache_order.size() > 2:
		cache.erase(cache_order.pop_front())
	return texture
