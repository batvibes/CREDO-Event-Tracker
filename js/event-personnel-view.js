export const EVENT_PERSONNEL_ROLES = ['facilitator', 'poc', 'credo_staff'];

export function emptyEventPersonnel() {
  return { facilitator: [], poc: [], credo_staff: [] };
}

export function eventPersonnelLabel(row) {
  if (row?.personId) {
    return String(row.displayName || row.canonicalDisplayName || row.sourceText || '').trim();
  }
  return String(row?.sourceText || '').trim();
}

function asPersonnelItem(row) {
  const personId = row?.personId || null;
  const sourceText = String(row?.sourceText || '').trim();
  const displayName = eventPersonnelLabel({ ...row, personId, sourceText });
  return {
    id: row?.id ?? null,
    eventId: row?.eventId ?? null,
    personId,
    role: row?.role ?? '',
    position: Number(row?.position ?? 0),
    sourceText,
    contactEmail: row?.contactEmail ?? null,
    displayName,
    canonicalDisplayName: personId ? (row?.canonicalDisplayName || displayName || null) : null,
    resolved: Boolean(personId),
  };
}

export function groupEventPersonnel(rows) {
  const byEvent = new Map();
  for (const row of rows || []) {
    if (!row?.eventId || !EVENT_PERSONNEL_ROLES.includes(row.role)) continue;
    const bucket = byEvent.get(row.eventId) || emptyEventPersonnel();
    bucket[row.role].push(asPersonnelItem(row));
    byEvent.set(row.eventId, bucket);
  }
  for (const bucket of byEvent.values()) {
    for (const role of EVENT_PERSONNEL_ROLES) {
      bucket[role].sort((left, right) => left.position - right.position);
    }
  }
  return byEvent;
}

export function attachEventPersonnel(eventList, rows) {
  const grouped = groupEventPersonnel(rows);
  for (const event of eventList || []) {
    event.personnel = grouped.get(event.id) || emptyEventPersonnel();
    event.personnelLoaded = true;
  }
  return eventList;
}

export function formatEventPersonnel(rows, role) {
  const ordered = [...(rows || [])].sort((left, right) => left.position - right.position);
  return ordered
    .map((row) => {
      const name = eventPersonnelLabel(row);
      if (!name) return '';
      if (role !== 'poc') return name;
      const email = String(row.contactEmail || '').trim();
      return email ? `${name} <${email}>` : name;
    })
    .filter(Boolean)
    .join(', ');
}

export function visibleEventPersonnel(event, role) {
  if (event?.personnelLoaded && event.personnel && Array.isArray(event.personnel[role])) {
    return formatEventPersonnel(event.personnel[role], role);
  }
  if (role === 'facilitator') return String(event?.facilitators || '');
  if (role === 'poc') return String(event?.poc || '');
  return String(event?.credoStaff || '');
}

export function editorTokenFromPersonnel(row) {
  const item = asPersonnelItem(row);
  return {
    id: item.personId,
    personId: item.personId,
    name: item.displayName,
    sourceText: item.sourceText,
    email: item.contactEmail,
    orphan: !item.resolved,
    eventPersonnelId: item.id,
  };
}

export function personnelViewFromEditorTokens(tokensByRole) {
  const grouped = emptyEventPersonnel();
  for (const role of EVENT_PERSONNEL_ROLES) {
    (tokensByRole?.[role] || []).forEach((token, position) => {
      const sourceText = String(token?.sourceText || token?.name || '').trim();
      if (!sourceText) return;
      const personId = token?.personId || null;
      const label = String(token?.name || sourceText).trim();
      grouped[role].push({
        id: token?.eventPersonnelId || null,
        eventId: null,
        personId,
        role,
        position,
        sourceText,
        contactEmail: role === 'poc'
          ? (String(token?.contactEmail || token?.email || '').trim() || null)
          : null,
        displayName: personId ? label : sourceText,
        canonicalDisplayName: personId ? label : null,
        resolved: Boolean(personId),
      });
    });
  }
  return grouped;
}

export function personnelWriteRows(tokensByRole) {
  const grouped = personnelViewFromEditorTokens(tokensByRole);
  return EVENT_PERSONNEL_ROLES.flatMap((role) => grouped[role].map((row) => ({
    role: row.role,
    personId: row.personId,
    sourceText: row.sourceText,
    contactEmail: row.contactEmail,
    position: row.position,
  })));
}
