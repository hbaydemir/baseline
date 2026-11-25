// Kullanıcının kurulu Bambu Studio'sundaki yazıcı profilini okuyup 3MF'e gömülecek tam ayarı kurar.
// Eksik ayarlı proje Bambu Studio'yu çökertiyor; bu yüzden ya tam profil gömülür ya da hiç ayar yazılmaz.
export type ReadProfile = (kind: 'machine' | 'process' | 'filament', name: string) => Promise<string>;
type J = Record<string, any>;
const META = new Set(['type', 'inherits', 'include', 'from', 'setting_id', 'instantiation', 'name', 'description', 'version', 'compatible_printers', 'compatible_prints', 'compatible_printers_condition', 'compatible_prints_condition', 'filament_id', 'family', 'renamed_from', 'url', 'upward_compatible_machine']);

async function flat(read: ReadProfile, kind: Parameters<ReadProfile>[0], name: string, depth = 0): Promise<J> {
  if (depth > 12) throw new Error('Profil zinciri çok uzun');
  const d = JSON.parse(await read(kind, name)) as J;
  const o: J = d.inherits ? await flat(read, kind, d.inherits, depth + 1) : {};
  for (const i of d.include ?? []) Object.assign(o, JSON.parse(await read(kind, i)));
  return Object.assign(o, d);
}
export async function bambuProject(read: ReadProfile, machine: string, colors: string[]): Promise<J> {
  const m = await flat(read, 'machine', machine), proc = m.default_print_profile as string, fil = [m.default_filament_profile].flat()[0] as string;
  const p = await flat(read, 'process', proc), f = await flat(read, 'filament', fil), n = colors.length, out: J = {};
  for (const d of [m, p]) for (const [k, v] of Object.entries(d)) if (!META.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(f)) if (!META.has(k)) out[k] = Array.isArray(v) ? Array.from({ length: n }, () => v).flat() : v;
  const variants = (f.filament_extruder_variant as string[] | undefined)?.length ?? 1, nozzles = [m.nozzle_diameter ?? '0.4'].flat().length;
  return Object.assign(out, {
    from: 'project', name: 'project_settings', version: '02.00.00.00',
    printer_settings_id: machine, print_settings_id: proc, filament_settings_id: Array(n).fill(fil), filament_ids: Array(n).fill(f.filament_id ?? ''),
    filament_colour: colors.map(c => c.toUpperCase()), filament_self_index: colors.flatMap((_, i) => Array(variants).fill(String(i + 1))),
    flush_volumes_matrix: Array.from({ length: nozzles }, () => colors.flatMap((_, a) => colors.map((_, b) => a === b ? '0' : '280'))).flat(), flush_volumes_vector: Array(2 * n).fill('140'),
  });
}
