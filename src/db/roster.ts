/**
 * The real operations team.
 *
 * Imported from the roster the operations supervisor keeps, names and numbers
 * exactly as they are written there. Employee codes are assigned here in the
 * roster's own order, so a code always points at the same person: add new
 * people at the END of this list and give them the next number, never renumber
 * the people above them — a code that changes hands breaks every past
 * assignment, report and audit line that already names it.
 *
 * Numbers are stored in full international form (+964…), which is what the
 * WhatsApp briefing links are built from.
 */

export type RosterEntry = {
  /** Stable identifier shown in the team list and on assignment sheets. */
  code: string;
  name: string;
  phone: string;
};

export const TEAM_ROSTER: RosterEntry[] = [
  { code: 'TZ-001', name: 'Abdallah Nemah', phone: '+9647713509128' },
  { code: 'TZ-002', name: 'Abdalrhman Aysar', phone: '+9647766668668' },
  { code: 'TZ-003', name: 'Abduallah Muhammed', phone: '+9647722979881' },
  { code: 'TZ-004', name: 'Adeeb Gahreeb', phone: '+9647765204261' },
  { code: 'TZ-005', name: 'Ahmed Jawad', phone: '+9647729414599' },
  { code: 'TZ-006', name: 'Ali Abdulhassan', phone: '+9647808263320' },
  { code: 'TZ-007', name: 'Ameen Raad', phone: '+9647750352352' },
  { code: 'TZ-008', name: 'Ameer Rifaat', phone: '+9647730488895' },
  { code: 'TZ-009', name: 'Baraa Talib', phone: '+9647733843470' },
  { code: 'TZ-010', name: 'Bashar Muhammed', phone: '+9647710001401' },
  { code: 'TZ-011', name: 'Bassam Sinan', phone: '+9647704401456' },
  { code: 'TZ-012', name: 'Hasaneen Ali', phone: '+9647716782902' },
  { code: 'TZ-013', name: 'Hassan Jihad', phone: '+9647732740557' },
  { code: 'TZ-014', name: 'Hussein Majeed', phone: '+9647834014649' },
  { code: 'TZ-015', name: 'Ibrahim Mohaned', phone: '+9647724727279' },
  { code: 'TZ-016', name: 'Jafar Abd', phone: '+9647710682485' },
  { code: 'TZ-017', name: 'Karar Ammar', phone: '+9647809931974' },
  { code: 'TZ-018', name: 'Mohammed Ayad', phone: '+9647704586955' },
  { code: 'TZ-019', name: 'Mohammed Firas', phone: '+9647822548927' },
  { code: 'TZ-020', name: 'Mohammed Noman', phone: '+9647824037906' },
  { code: 'TZ-021', name: 'Mohammed Raad', phone: '+9647711799700' },
  { code: 'TZ-022', name: 'Montather Salim', phone: '+9647835111370' },
  { code: 'TZ-023', name: 'Muhammed Khaleel', phone: '+9647761758789' },
  { code: 'TZ-024', name: 'Murtadha Najem', phone: '+9647734591075' },
  { code: 'TZ-025', name: 'Mustafa Asaad', phone: '+9647704863966' },
  { code: 'TZ-026', name: 'Mustafa Mohammed', phone: '+9647700939289' },
  { code: 'TZ-027', name: 'Mustafa Taha', phone: '+9647808129493' },
  { code: 'TZ-028', name: 'Rabeea Majeed', phone: '+9647817572825' },
  { code: 'TZ-029', name: 'Sajad Ibrahim', phone: '+9647837722993' },
  { code: 'TZ-030', name: 'Thamer Abbas', phone: '+9647702586360' },
  { code: 'TZ-031', name: 'Yassin Ali', phone: '+9647865033428' },
  { code: 'TZ-032', name: 'Ziyad Tariq', phone: '+9647717777859' },
  { code: 'TZ-033', name: 'Mohammed Rabah', phone: '+9647764134448' },
  { code: 'TZ-034', name: 'Abdallah Omer', phone: '+9647848200289' },
  { code: 'TZ-035', name: 'Haider Hafez', phone: '+9647718650827' },
  { code: 'TZ-036', name: 'Mustafa Hassan', phone: '+9647716953369' },
  { code: 'TZ-037', name: 'Kadhim Ismail', phone: '+9647739599885' },
  { code: 'TZ-038', name: 'Azad Qadir', phone: '+9647716456941' },
  { code: 'TZ-039', name: 'Mohammed Matrood', phone: '+9647722810344' },
  { code: 'TZ-040', name: 'Hussein Ali', phone: '+9647712129982' },
  { code: 'TZ-041', name: 'Hassan Ali', phone: '+9647842522309' },
  { code: 'TZ-042', name: 'Suhaib Qadir', phone: '+9647716456839' },
  { code: 'TZ-043', name: 'Haider Kataa', phone: '+9647728523509' },
  { code: 'TZ-044', name: 'Yousif Ali', phone: '+9647740674408' },
  { code: 'TZ-045', name: 'Mujtaba Mohammed', phone: '+9647719702658' },
  { code: 'TZ-046', name: 'Murtadha Mohammed', phone: '+9647710843425' },
  { code: 'TZ-047', name: 'Ameer Dawood', phone: '+9647711720008' },
  { code: 'TZ-048', name: 'Aws Qais', phone: '+9647811441861' },
  { code: 'TZ-049', name: 'Abdallah Rasheed', phone: '+9647722002001' },
  { code: 'TZ-050', name: 'Ahmed Waei', phone: '+9647812387474' },
  { code: 'TZ-051', name: 'Ahmed Musa', phone: '+9647766931232' },
  { code: 'TZ-052', name: 'Ibrahim Ali', phone: '+9647735553176' },
  { code: 'TZ-053', name: 'Mustafa Ibrahim', phone: '+9647902663677' },
  { code: 'TZ-054', name: 'Yousif Razzaq', phone: '+9647873391192' },
  { code: 'TZ-055', name: 'Muqtada Riyadh', phone: '+9647765310314' },
  { code: 'TZ-056', name: 'Ahmed Sataar', phone: '+9647722774135' },
  { code: 'TZ-057', name: 'Yousif Raad', phone: '+9647728896656' },
  { code: 'TZ-058', name: 'Haitham Omer', phone: '+9647708167946' },
  { code: 'TZ-059', name: 'Ahmed Abbas', phone: '+9647716016739' },
  { code: 'TZ-060', name: 'Hussein Adel', phone: '+9647725953656' },
  { code: 'TZ-061', name: 'Mohammed Abbas', phone: '+9647740459686' },
  { code: 'TZ-062', name: 'Ahmed Alaawy', phone: '+9647719314221' },
  { code: 'TZ-063', name: 'Zainalabeden Haider', phone: '+9647710582375' },
  { code: 'TZ-064', name: 'Haider Jihad', phone: '+9647740680553' },
  { code: 'TZ-065', name: 'Jafar Dhiaa', phone: '+9647736437154' },
  { code: 'TZ-066', name: 'Rokan Khalid', phone: '+9647711738456' },
  { code: 'TZ-067', name: 'Ali Kazem', phone: '+9647742112116' },
  { code: 'TZ-068', name: 'Ali Qassim', phone: '+9647715470885' },
  { code: 'TZ-069', name: 'Hussin Alaa', phone: '+9647724062882' },
  { code: 'TZ-070', name: 'Abdualrahman Ibraheem', phone: '+9647714800181' },
  { code: 'TZ-071', name: 'Ameer Ali', phone: '+9647742417129' },
  { code: 'TZ-072', name: 'Mohammed Alqassab', phone: '+9647830756047' },
  { code: 'TZ-073', name: 'Ahmed Hashem', phone: '+9647832884216' },
  { code: 'TZ-074', name: 'Hassan Qassim', phone: '+9647762192499' },
  { code: 'TZ-075', name: 'Ibrahim Amjad', phone: '+9647814697160' },
  { code: 'TZ-076', name: 'Ahmed Deuaan', phone: '+9647724885507' },
  { code: 'TZ-077', name: 'Abdulla Saddam', phone: '+9647760501140' },
  { code: 'TZ-078', name: 'Ahmed Salah', phone: '+9647710633305' },
  { code: 'TZ-079', name: 'Alfadel Fadel', phone: '+9647718207380' },
  { code: 'TZ-080', name: 'Ali Alhadi Ammar', phone: '+9647737684663' },
  { code: 'TZ-081', name: 'Ali Mohammed', phone: '+9647744490221' },
  { code: 'TZ-082', name: 'Baker Tariq', phone: '+9647838980891' },
  { code: 'TZ-083', name: 'Hayder Mustafa', phone: '+9647870066149' },
  { code: 'TZ-084', name: 'Husaam Mustafa', phone: '+9647738094502' },
  { code: 'TZ-085', name: 'Mohammed Almahdi', phone: '+9647881318110' },
  { code: 'TZ-086', name: 'Mohammed Mazen', phone: '+9647733878157' },
  { code: 'TZ-087', name: 'Sarmad Hisham', phone: '+9647724671661' },
  { code: 'TZ-088', name: 'Yaseen Taha', phone: '+9647722888151' },
  { code: 'TZ-089', name: 'Aws Nibras', phone: '+9647805682370' },
  { code: 'TZ-090', name: 'Ali Ahmed', phone: '+9647740558197' },
  { code: 'TZ-091', name: 'Hussien Ali Naseer', phone: '+9647740527103' },
  { code: 'TZ-092', name: 'Haider Omad', phone: '+9647902680553' },
];
