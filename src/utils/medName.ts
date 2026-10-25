// الاسم المعروض للمادة في كل الواجهات: الإنكليزي (بلا علامة *) إن وُجد، وإلا العربي.
// الاسم العربي يبقى مخزَّناً ومفهرساً للبحث، لكنه لا يُعرض إلا لمادة بلا اسم إنكليزي.
export const cleanEnName = (s?: string | null): string =>
  (s || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export const medDisplayName = (m: { nameAr?: string | null; nameEn?: string | null }): string =>
  (/[A-Za-z]/.test(cleanEnName(m.nameEn)) ? cleanEnName(m.nameEn) : '') || (m.nameAr || '').trim();
