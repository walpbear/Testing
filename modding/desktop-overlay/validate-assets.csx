using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using UndertaleModLib;
using UndertaleModLib.Models;
using UndertaleModLib.Util;

EnsureDataLoaded();
var targetPath = Environment.GetEnvironmentVariable("UMT_VALIDATION_TARGET") ?? "/workspace/overlay-build/data.win";
var reportPath = Environment.GetEnvironmentVariable("UMT_VALIDATION_REPORT") ?? "/workspace/overlay-build/validation-report.json";
var targetStream = File.OpenRead(targetPath);
var target = UndertaleIO.Read(targetStream);
var baseData = Data;

string Hash(byte[] value) => Convert.ToHexString(SHA256.HashData(value)).ToLowerInvariant();
byte[] ImageBytes(GMImage image)
{
    using (var stream = new MemoryStream())
    {
        using (var writer = new BinaryWriter(stream, System.Text.Encoding.UTF8, true))
            image.WriteToBinaryWriter(writer, baseData.IsVersionAtLeast(2022, 5));
        return stream.ToArray();
    }
}

var collections = new [] {
    "Extensions", "Sounds", "AudioGroups", "Sprites", "Backgrounds", "Paths", "Scripts",
    "GlobalInitScripts", "GameEndScripts", "Shaders", "Fonts", "Timelines", "GameObjects",
    "Rooms", "TexturePageItems", "Code", "Variables", "Functions", "CodeLocals", "Strings",
    "EmbeddedImages", "EmbeddedTextures", "TextureGroupInfo", "EmbeddedAudio", "AnimationCurves",
    "Sequences", "FilterEffects", "ParticleSystems", "ParticleSystemEmitters"
};
var stableReferences = new Dictionary<object, string>(ReferenceEqualityComparer.Instance);
void Register(UndertaleData data)
{
    foreach (var category in collections)
    {
        var items = (IEnumerable)typeof(UndertaleData).GetProperty(category).GetValue(data);
        if (items == null) continue;
        int index = 0;
        foreach (var item in items)
        {
            if (item != null && !(item is UndertaleString))
            {
                var name = (item as UndertaleNamedResource)?.Name?.Content;
                stableReferences[item] = category + ":" + index + ":" + name;
            }
            index++;
        }
    }
}
Register(baseData);
Register(target);

object Snapshot(object value, bool expandRoot, HashSet<object> stack, int depth = 0)
{
    if (value == null) return null;
    var type = value.GetType();
    if (type.IsPrimitive || type.IsEnum || value is string || value is decimal) return value;
    if (value is UndertaleString text) return text.Content;
    // Instructions share primitive storage with on-disk reference-chain offsets.
    // The disassembler selects the fields meaningful for each opcode, excluding relocation offsets.
    if (value is UndertaleInstruction instruction) return instruction.ToString();
    if (value is byte[] bytes) return new SortedDictionary<string, object> { ["bytes"] = bytes.Length, ["sha256"] = Hash(bytes) };
    if (value is GMImage image) return new SortedDictionary<string, object> {
        ["format"] = image.Format.ToString(), ["width"] = image.Width, ["height"] = image.Height,
        ["sha256"] = Hash(ImageBytes(image))
    };
    if (!expandRoot && stableReferences.TryGetValue(value, out var reference)) return new SortedDictionary<string, object> { ["$reference"] = reference };
    if (value is Delegate) return "<delegate>";
    if (depth > 40) throw new Exception("Snapshot recursion exceeded for " + type.FullName);
    if (!type.IsValueType && !stack.Add(value)) return "<cycle:" + type.FullName + ">";
    try
    {
        if (value is IEnumerable sequence)
        {
            var values = new List<object>();
            foreach (var item in sequence) values.Add(Snapshot(item, false, stack, depth + 1));
            return values;
        }
        var result = new SortedDictionary<string, object> { ["$type"] = type.FullName };
        foreach (var property in type.GetProperties(BindingFlags.Instance | BindingFlags.Public).OrderBy(p => p.Name))
        {
            if (!property.CanRead || property.GetIndexParameters().Length != 0 || property.Name.StartsWith("Project")) continue;
            if (property.Name == "ParentEntry" || property.Name == "ChildEntries") continue;
            result[property.Name] = Snapshot(property.GetValue(value), false, stack, depth + 1);
        }
        foreach (var field in type.GetFields(BindingFlags.Instance | BindingFlags.Public).OrderBy(p => p.Name))
            result["field:" + field.Name] = Snapshot(field.GetValue(value), false, stack, depth + 1);
        return result;
    }
    finally { if (!type.IsValueType) stack.Remove(value); }
}
string Canonical(object value, bool expandRoot = true) => JsonSerializer.Serialize(Snapshot(value, expandRoot, new HashSet<object>(ReferenceEqualityComparer.Instance)));

var allowedChanged = new HashSet<string> {
    "gml_Object_oFutaMatingPress_Create_0", "gml_Object_oFutaMatingPress_Step_0",
    "gml_Object_oFutaMatingPress_Draw_0", "gml_Object_oFutaMatingPress_Draw_64",
    "gml_Object_oBackground_Draw_0"
};
var failures = new List<string>();
var results = new SortedDictionary<string, object>();
var changedCode = new List<string>();
foreach (var category in collections.Where(c => c != "Strings" && c != "Variables" && c != "Functions" && c != "CodeLocals"))
{
    var left = ((IEnumerable)typeof(UndertaleData).GetProperty(category).GetValue(baseData))?.Cast<object>().ToList() ?? new List<object>();
    var right = ((IEnumerable)typeof(UndertaleData).GetProperty(category).GetValue(target))?.Cast<object>().ToList() ?? new List<object>();
    if (left.Count != right.Count) failures.Add(category + " resource count changed: " + left.Count + " -> " + right.Count);
    var changed = new List<int>();
    for (int i = 0; i < Math.Min(left.Count, right.Count); i++)
    {
        if (Canonical(left[i]) == Canonical(right[i])) continue;
        changed.Add(i);
        if (category == "Code")
        {
            var name = ((UndertaleCode)left[i]).Name.Content;
            changedCode.Add(name);
            // Child entries share their parent's bytecode and can change offsets when the parent is rebuilt.
            var parentName = ((UndertaleCode)left[i]).ParentEntry?.Name.Content;
            if (!allowedChanged.Contains(name) && !allowedChanged.Contains(parentName ?? "")) failures.Add("Unexpected code change: " + name);
        }
        else failures.Add("Unexpected asset change: " + category + "[" + i + "]");
    }
    results[category] = new { count = left.Count, changed = changed.ToArray() };
}
foreach (var category in new [] { "GeneralInfo", "Options", "Language", "Tags", "FeatureFlags" })
{
    var property = typeof(UndertaleData).GetProperty(category);
    var equal = Canonical(property.GetValue(baseData)) == Canonical(property.GetValue(target));
    results[category] = new { unchanged = equal };
    if (!equal) failures.Add("Unexpected metadata change: " + category);
}
// Existing strings must retain both their contents and indices; new compiler strings may append.
for (int i = 0; i < baseData.Strings.Count; i++)
    if (i >= target.Strings.Count || baseData.Strings[i].Content != target.Strings[i].Content)
        failures.Add("Existing string changed at index " + i);
results["Strings"] = new { before = baseData.Strings.Count, after = target.Strings.Count };
results["Variables"] = new { before = baseData.Variables.Count, after = target.Variables.Count };
results["Functions"] = new { before = baseData.Functions.Count, after = target.Functions.Count };
var report = new {
    passed = failures.Count == 0,
    target = targetPath,
    targetSha256 = Hash(File.ReadAllBytes(targetPath)),
    changes = changedCode,
    results,
    failures
};
File.WriteAllText(reportPath, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
target.Dispose();
targetStream.Dispose();
ScriptMessage("Asset validation " + (failures.Count == 0 ? "passed" : "FAILED") + ": " + reportPath);
if (failures.Count > 0) throw new Exception(String.Join("\n", failures));
