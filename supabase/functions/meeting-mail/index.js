// 회의록 메일 알림 (migration 0013). 회의록이 최종 저장되면 DB 가 바로 부르고(?kick=1),
// 5분마다 예약 작업도 부른다. meeting_mails 대기열을 비운다.
//
// 메일은 MDD 프로젝트의 mail-relay 함수를 거쳐 회사 noreply@ 로 나간다 — 회사 메일 앱 정보는
// 그쪽에만 있다. 열쇠는 private_settings.mail_relay_token.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const RELAY_URL = 'https://lpzicdsbwbnjphuraeao.supabase.co/functions/v1/mail-relay';
// MDD 프로젝트의 공개(anon) 키 — 함수 입구 통과용. 실제 권한 확인은 열쇠로 한다
const RELAY_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwemljZHNid2JuanBodXJhZWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MzQxNTcsImV4cCI6MjEwNTAxMDE1N30.UMk1CjOIST_GwKCS1dP1xiYlLfpw6nkSlye8diRSdUU';
const APP_URL = Deno.env.get('APP_URL') || 'https://zich-k.github.io/team-task/v2/';
// 할 일은 회의록 저장 뒤 이어서 저장되므로 잠깐 기다렸다가 읽는다
const KICK_SETTLE_MS = 10_000;
const MAX_TEXT = 2000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const FONT = "'Malgun Gothic','맑은 고딕',Apple SD Gothic Neo,-apple-system,sans-serif";
const INK = '#25282b';

const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const clip = s => { const t = String(s ?? '').trim(); return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + ' …' : t; };
const multiline = s => esc(clip(s)).replaceAll('\n', '<br>');

// 한국 시간 'YYYY-MM-DD HH:mm'
function kst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return d.slice(0, 10) + ' ' + d.slice(11, 16);
}

function section(label, inner) {
  return '<tr><td style="padding:20px 0 0 0">' +
    '<div style="font-family:' + FONT + ';font-size:13px;font-weight:bold;color:' + INK + ';padding-bottom:6px">' + esc(label) + '</div>' +
    inner + '</td></tr>';
}

function textBox(html) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="#f7f8f9" style="background:#f7f8f9;padding:12px 16px;font-family:' + FONT + ';font-size:14px;color:' + INK + ';line-height:1.6">' + html + '</td>' +
    '</tr></table>';
}

// Outlook(데스크톱)이 div 여백·배경을 무시하므로 MDD 메일처럼 표로만 그린다
export function buildMail({ meeting, items, actor, attendees, groupTitle }) {
  const info = [
    ['회의명', meeting.title],
    ['일시', kst(meeting.meeting_at)],
    ['정기 회의', meeting.series],
    ['관련 업무', groupTitle],
    ['참석자', [attendees.join(', '), meeting.external_attendees].filter(Boolean).join(' / ')],
    ['작성자', actor],
  ].filter(r => r[1]);
  const infoRows = info.map((r, i) =>
    '<tr>' +
    '<td width="80" valign="top" style="padding:9px 0;' + (i < info.length - 1 ? 'border-bottom:1px solid #edf0f3;' : '') + 'font-family:' + FONT + ';font-size:13px;color:#75787b">' + esc(r[0]) + '</td>' +
    '<td valign="top" style="padding:9px 0;' + (i < info.length - 1 ? 'border-bottom:1px solid #edf0f3;' : '') + 'font-family:' + FONT + ';font-size:13.5px;color:' + INK + ';font-weight:bold">' + esc(r[1]) + '</td>' +
    '</tr>').join('');

  const todo = items.length
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #c5c8cb">' +
      '<tr>' + ['할 일', '담당', '기한'].map((h, i) =>
        '<td' + (i ? ' width="' + (i === 1 ? 80 : 90) + '"' : '') + ' bgcolor="#f7f8f9" style="background:#f7f8f9;padding:7px 8px;border-bottom:1px solid #c5c8cb;font-family:' + FONT + ';font-size:12px;color:#75787b">' + h + '</td>').join('') + '</tr>' +
      items.map(it =>
        '<tr>' +
        '<td valign="top" style="padding:8px;border-bottom:1px solid #edf0f3;font-family:' + FONT + ';font-size:13.5px;color:' + INK + '">' + esc(it.content) + '</td>' +
        '<td valign="top" style="padding:8px;border-bottom:1px solid #edf0f3;font-family:' + FONT + ';font-size:13px;color:' + INK + '">' + esc(it.assignee || '-') + '</td>' +
        '<td valign="top" style="padding:8px;border-bottom:1px solid #edf0f3;font-family:' + FONT + ';font-size:13px;color:' + INK + '">' + esc(it.due_date || '-') + '</td>' +
        '</tr>').join('') +
      '</table>'
    : '';

  const title = (actor ? actor + ' 님이 ' : '') + '회의록을 등록했습니다';
  const link = APP_URL + '#meetings';

  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(meeting.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#edf0f3">' +
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + esc(title + ' · ' + meeting.title) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#edf0f3" style="background:#edf0f3"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">' +
    '<tr><td bgcolor="' + INK + '" style="background:' + INK + ';padding:18px 28px">' +
    '<div style="font-family:' + FONT + ';font-size:17px;font-weight:bold;color:#ffffff">팀 업무관리</div>' +
    '<div style="font-family:' + FONT + ';font-size:12px;color:#b8babd;padding-top:2px">회의록 알림</div>' +
    '</td></tr>' +
    '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:28px 28px 24px 28px;border-left:1px solid #c5c8cb;border-right:1px solid #c5c8cb">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="padding:0 0 10px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="#eaeef2" style="background:#eaeef2;padding:4px 10px;border-radius:4px;font-family:' + FONT + ';font-size:12px;font-weight:bold;color:#3a5068">회의록</td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:0 0 18px 0;font-family:' + FONT + ';font-size:20px;font-weight:bold;color:' + INK + ';line-height:1.4">' + esc(title) + '</td></tr>' +
    '<tr><td style="border-top:2px solid ' + INK + ';padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + infoRows + '</table></td></tr>' +
    (clip(meeting.agenda) ? section('안건', textBox(multiline(meeting.agenda))) : '') +
    (clip(meeting.decisions) ? section('결정 사항', textBox(multiline(meeting.decisions))) : '') +
    (todo ? section('할 일', todo) : '') +
    '<tr><td style="padding:24px 0 4px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="' + INK + '" style="background:' + INK + ';padding:12px 26px;border-radius:6px">' +
    '<a href="' + esc(link) + '" style="font-family:' + FONT + ';font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block">회의록 보기 &rarr;</a>' +
    '</td></tr></table></td></tr>' +
    '</table></td></tr>' +
    '<tr><td bgcolor="#f7f8f9" style="background:#f7f8f9;padding:16px 28px;border:1px solid #c5c8cb;border-top:0;font-family:' + FONT + ';font-size:12px;color:#75787b;line-height:1.7">' +
    '[답장]을 누르면 작성자에게 메일이 갑니다.<br>회의 메모 등 전체 내용은 팀 업무관리 사이트에서 확인해 주세요.' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

Deno.serve(async req => {
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (new URL(req.url).searchParams.get('kick') === '1') {
    await new Promise(r => setTimeout(r, KICK_SETTLE_MS));
  }

  const { data: rows, error } = await admin.rpc('claim_meeting_mails');
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!rows?.length) return json({ ok: true, sent: 0 });

  const done = (id, patch) => admin.from('meeting_mails').update(patch).eq('id', id);

  const { data: setting } = await admin.from('private_settings').select('value').eq('key', 'mail_relay_token').maybeSingle();
  if (!setting?.value) {
    // 연결 전에 쌓인 것은 나중에 한꺼번에 보내지 않는다
    for (const r of rows) await done(r.id, { status: 'skipped', error: '메일 중계 열쇠가 없습니다 (private_settings.mail_relay_token).' });
    return json({ ok: true, skipped: rows.length, reason: 'relay_not_configured' });
  }

  const { data: profiles } = await admin.from('profiles').select('id, name, email, active');
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  let sent = 0, failed = 0, skipped = 0;

  for (const r of rows) {
    try {
      const { data: meeting } = await admin.from('meetings').select('*').eq('id', r.meeting_id).maybeSingle();
      if (!meeting || meeting.deleted_at || meeting.status !== 'final') {
        await done(r.id, { status: 'skipped', error: '회의록이 삭제되었거나 임시 저장 상태입니다.' });
        skipped++;
        continue;
      }
      const to = (profiles || [])
        .filter(p => p.active && p.email && p.id !== r.actor_id)
        .map(p => p.email.trim());
      if (!to.length) {
        await done(r.id, { status: 'skipped', error: '받을 팀원이 없습니다.' });
        skipped++;
        continue;
      }
      const { data: itemRows } = await admin.from('meeting_items')
        .select('content, assignee_id, due_date, sort_order').eq('meeting_id', meeting.id).order('sort_order');
      let groupTitle = '';
      if (meeting.group_id) {
        const { data: g } = await admin.from('task_groups').select('title').eq('id', meeting.group_id).maybeSingle();
        groupTitle = g?.title || '';
      }
      const actor = byId.get(r.actor_id);
      const html = buildMail({
        meeting,
        items: (itemRows || []).map(i => ({ ...i, assignee: byId.get(i.assignee_id)?.name || '' })),
        actor: actor?.name || '',
        attendees: (meeting.attendee_ids || []).map(id => byId.get(id)?.name).filter(Boolean),
        groupTitle,
      });

      const res = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RELAY_ANON_KEY, 'x-relay-token': setting.value },
        body: JSON.stringify({
          to,
          subject: '[회의록] ' + meeting.title + ' (' + kst(meeting.meeting_at).slice(5, 10).replace('-', '/') + ')',
          html,
          replyTo: actor?.email ? { email: actor.email, name: actor.name } : undefined,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) {
        await done(r.id, { status: 'sent', recipients: to, sent_at: new Date().toISOString(), error: null });
        sent++;
      } else {
        await done(r.id, { status: 'failed', recipients: to, error: ('중계 ' + res.status + ': ' + JSON.stringify(out)).slice(0, 500) });
        failed++;
      }
    } catch (e) {
      await done(r.id, { status: 'failed', error: String(e?.message || e).slice(0, 500) });
      failed++;
    }
  }
  return json({ ok: true, sent, failed, skipped });
});
