/** Manual metadata-only diagnosis of the single missing_inline_text rejection. */
function diagnoseIntake() {
  try {
    const store = PropertiesService.getScriptProperties();
    const config = lbConfig(store);
    lbRequire(lbAddress(Gmail.Users.getProfile('me').emailAddress) === config.account, 'wrong_account');
    const rejected = Object.entries(store.getProperties())
      .filter(([key]) => key.startsWith('LB_MSG_'))
      .map(([, value]) => JSON.parse(value))
      .filter(r => r.outcome === 'rejected' && r.reason === 'missing_inline_text');
    lbRequire(rejected.length === 1, 'Exactly one matching rejection is required');
    const id = rejected[0].messageId;
    lbRequire(/^[a-z0-9]{1,64}$/i.test(id), 'invalid_id');
    const message = Gmail.Users.Messages.get('me', id, {format: 'full'});
    lbEnvelope(message, config);
    const parts = [];
    function visit(part, depth) {
      lbRequire(depth <= 10 && parts.length < 50, 'MIME structure exceeds diagnostic bounds');
      const body = part.body || {};
      parts.push({depth: depth,
        mimeType: String(part.mimeType || '').replace(/[^a-z0-9/+.-]/gi, '').slice(0, 80),
        filenamePresent: Boolean(part.filename), bodyPresent: Boolean(part.body),
        dataType: typeof body.data, dataIsArray: Array.isArray(body.data),
        encodedCharacters: typeof body.data === 'string' ? body.data.length : null,
        bodySize: typeof body.size === 'number' ? body.size : null,
        externalBodyPresent: typeof body.attachmentId === 'string' && body.attachmentId.length > 0,
        childCount: (part.parts || []).length});
      (part.parts || []).forEach(child => visit(child, depth + 1));
    }
    visit(message.payload || {}, 0);
    const result = {status: 'diagnostic_only', rejectionReason: 'missing_inline_text', parts: parts};
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    throw new Error('Metadata diagnosis stopped; no message or receipt was changed. Check account, access and matching rejection count.');
  }
}
