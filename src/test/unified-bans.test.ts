// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Explicit opt-in isolated DB, never the application's database credentials.
const enabled = process.env['VOLI_BAN_TEST_DB'] === 'local';
const admin = '00000000-0000-0000-0000-000000000001';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';
const c = '00000000-0000-0000-0000-000000000004';
function sql(text: string) {
  return execFileSync('psql', ['-h', '/tmp/voli-pg-socket', '-p', '55432', '-U', 'voli_test', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8' }).trim();
}
function asAdmin(text: string) { return sql(`set test.uid='${admin}'; ${text}`); }
describe.skipIf(!enabled)('unified bans in isolated PostgreSQL', () => {
  beforeAll(() => {
    sql(readFileSync('src/test/fixtures/ban-schema.sql', 'utf8'));
    sql(readFileSync('sql/015_device_bans.sql', 'utf8'));
    sql(readFileSync('sql/016_unified_bans.sql', 'utf8'));
    sql(`set test.uid='${a}'; select public.voli_report_device('shared'); select public.voli_report_device('other-a');
      set test.uid='${b}'; select public.voli_report_device('shared'); select public.voli_report_device('other-b');`);
  });
  it('allocates globally unique codes starting at 200', () => {
    expect(asAdmin("select public.admin_create_ban('device','shared');")).toBe('200');
    expect(asAdmin("select public.admin_create_ban('account','101');")).toBe('201');
    expect(asAdmin("select public.admin_create_ban('ip','185.12.4.9');")).toBe('202');
    expect(asAdmin("select public.admin_create_ban('network','185.12.4.0/24');")).toBe('203');
  });
  it('bans all accounts historically used on the device', () => {
    expect(sql(`select count(*) from public.member_bans where auth_id in ('${a}','${b}');`)).toBe('2');
    expect(sql(`select count(*) from auth.users where id in ('${a}','${b}') and banned_until > now();`)).toBe('2');
  });
  it('keeps linked accounts banned on another device', () => {
    expect(sql(`set test.uid='${b}'; select public.voli_report_device('brand-new')->>'code';`)).toBe('200');
    expect(sql(`select banned_until > now() from auth.users where id='${b}';`)).toBe('t');
  });
  it('links accounts newly reported on an actively banned device', () => {
    expect(sql(`set test.uid='${c}'; select public.voli_report_device('shared')->>'code';`)).toBe('200');
    expect(sql(`select count(*) from public.member_bans where auth_id='${c}';`)).toBe('1');
  });
  it('ID search returns all historical devices and same-device accounts', () => {
    const result = JSON.parse(asAdmin("select public.admin_device_connections('101');"));
    expect(result.devices.map((d: { device_id: string }) => d.device_id).sort()).toEqual(['other-a', 'shared']);
    expect(result.accounts.map((r: { public_id: number }) => r.public_id)).toEqual([101, 102, 103]);
  });
  it('revoking device source preserves independent account bans', () => {
    asAdmin('select public.admin_revoke_ban(id) from public.voli_bans where code=200;');
    expect(sql(`select count(*) from public.member_bans where auth_id='${a}';`)).toBe('1');
    expect(sql(`select count(*) from public.member_bans where auth_id in ('${b}','${c}');`)).toBe('0');
    expect(sql(`select banned_until is null from auth.users where id='${b}';`)).toBe('t');
  });
  it('rejects non-administrators', () => {
    expect(() => sql(`set test.uid='${b}'; select public.admin_create_ban('account','101');`)).toThrow();
  });
  it('does not ban management through a shared device', () => {
    sql(`set test.uid='${admin}'; select public.voli_report_device('admin-device');`);
    expect(() => asAdmin("select public.admin_create_ban('device','admin-device');")).toThrow();
  });
  it('can rerun the owner upgrade without resurrecting revoked sources', () => {
    sql(readFileSync('sql/016_unified_bans.sql','utf8'));
    expect(sql('select count(*) from public.voli_bans;')).toBe('4');
    expect(sql(`select count(*) from public.member_bans where auth_id='${b}';`)).toBe('0');
  });
});