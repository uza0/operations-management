/*
 * A task on the card is the member's title, so it gets a short, proud name
 * rather than the long one the gate sheet uses. OTHER says nothing about him
 * and falls back to the crew line.
 */
export const ROLE_NAME: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    TICKET_CHECK: 'تدقيق التذاكر',
    ELECTRONIC_SCANNING: 'مسح التذاكر',
    PAPER_TICKETS: 'التذاكر الورقية',
    CROWD_GUIDANCE: 'توجيه الجمهور',
    WRISTBAND_DISTRIBUTION: 'توزيع الأساور',
    WRISTBAND_FITTING: 'تركيب الأساور',
    VIP_MANAGEMENT: 'كبار الشخصيات VIP',
    INFORMATION: 'الاستعلامات',
    GATE_MANAGEMENT: 'إدارة البوابة',
    SECURITY_SUPPORT: 'الإسناد الأمني',
    TECHNICAL_SUPPORT: 'الإسناد الفني',
    SALES: 'المبيعات',
    TEAM_LEAD: 'قائد فريق',
  },
  en: {
    TICKET_CHECK: 'Ticket Check',
    ELECTRONIC_SCANNING: 'Ticket Scanning',
    PAPER_TICKETS: 'Paper Tickets',
    CROWD_GUIDANCE: 'Crowd Guidance',
    WRISTBAND_DISTRIBUTION: 'Wristband Desk',
    WRISTBAND_FITTING: 'Wristband Fitting',
    VIP_MANAGEMENT: 'VIP Management',
    INFORMATION: 'Information Desk',
    GATE_MANAGEMENT: 'Gate Management',
    SECURITY_SUPPORT: 'Security Support',
    TECHNICAL_SUPPORT: 'Technical Support',
    SALES: 'Sales',
    TEAM_LEAD: 'Team Lead',
  },
};
