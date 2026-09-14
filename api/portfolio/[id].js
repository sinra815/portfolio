import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function verify(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const actual = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(record.hash, 'hex'));
}
function key(id) { return `portfolio:${id}`; }

export default async function handler(req, res) {
  const id = String(req.query.id || '').toLowerCase();
  if (!/^[a-z0-9_-]{3,40}$/.test(id)) {
    return res.status(400).json({error:'잘못된 포트폴리오 ID입니다.'});
  }

  const password = String(req.headers['x-portfolio-password'] || '');
  if (password.length < 6) {
    return res.status(401).json({error:'비밀번호가 필요합니다.'});
  }

  try {
    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!body.data) return res.status(400).json({error:'저장할 데이터가 없습니다.'});

      const existing = await kv.get(key(id));
      if (existing && !verify(password, existing)) {
        return res.status(403).json({error:'비밀번호가 올바르지 않습니다.'});
      }

      const salt = existing?.salt || crypto.randomBytes(16).toString('hex');
      const record = {
        salt,
        hash: existing?.hash || hashPassword(password, salt),
        data: body.data,
        updatedAt: new Date().toISOString()
      };
      await kv.set(key(id), record);
      return res.status(200).json({ok:true});
    }

    if (req.method === 'GET') {
      const record = await kv.get(key(id));
      if (!record) return res.status(404).json({error:'해당 포트폴리오가 없습니다.'});
      if (!verify(password, record)) return res.status(403).json({error:'비밀번호가 올바르지 않습니다.'});
      return res.status(200).json({data: record.data, updatedAt: record.updatedAt});
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({error:'허용되지 않은 요청입니다.'});
  } catch (e) {
    console.error(e);
    return res.status(500).json({error:'서버 저장소 오류입니다. Vercel KV 환경변수를 확인하세요.'});
  }
}
