export interface ILandlordProfileSummary {
  id: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  companyName?: string;
}

export interface ILandlordMonthlyIncomeCard {
  monthlyIncome: number;
  currency: string;
  formattedMonthlyIncome: string;
  occupiedPropertiesCount: number;
  occupiedPropertiesText: string;
  totalPropertiesCount: number;
  totalTenantsCount: number;
  occupancyRate: number;
  formattedOccupancyRate: string;
}

export interface ILandlordFinancialOverview {
  collectedPercentage: number;
  formattedCollectedPercentage: string;
  paidAmount: number;
  formattedPaidAmount: string;
  pendingAmount: number;
  formattedPendingAmount: string;
  overdueAmount: number;
  formattedOverdueAmount: string;
  expectedTotal: number;
  formattedExpectedTotal: string;
  period: string;
}

export interface INeedsAttentionOverdueRentItem {
  id: string;
  invoiceNumber?: string;
  billType?: string;
  billCategory?: string;
  title: string;
  subtitle: string;
  amount: number;
  formattedAmount: string;
  dueDate: Date | string;
  daysOverdue: number;
  statusText?: string;
  tenant?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    profileImage?: string;
  };
  property?: {
    id?: string;
    propertyName?: string;
    streetAddress?: string;
    postCode?: string;
  };
  flat?: {
    id?: string;
    unitName?: string;
    floor?: number;
  };
}

export interface INeedsAttentionTenantReportItem {
  id: string;
  jobId?: string;
  title: string;
  subtitle: string;
  priority: string;
  status?: string;
  date: Date | string;
  tenant?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    profileImage?: string;
  };
  property?: {
    id?: string;
    propertyName?: string;
    streetAddress?: string;
    postCode?: string;
  };
  flat?: {
    id?: string;
    unitName?: string;
  };
}

export interface INeedsAttentionOverdueRent {
  type: "overdue_rent";
  count: number;
  title: string;
  subtitle: string;
  amount: number;
  formattedAmount: string;
  actionRoute: string;
  items: INeedsAttentionOverdueRentItem[];
}

export interface INeedsAttentionTenantReports {
  type: "tenant_reports";
  count: number;
  title: string;
  subtitle: string;
  actionRoute: string;
  items: INeedsAttentionTenantReportItem[];
}

export type INeedsAttentionItem =
  | INeedsAttentionOverdueRent
  | INeedsAttentionTenantReports;

export interface ISmartReminderDashboardItem {
  id: string;
  title: string;
  propertyId?: string;
  propertyName?: string;
  streetAddress?: string;
  postCode?: string;
  dueDate: Date | string;
  status: string;
  isOverdue: boolean;
  daysLate: number;
  daysRemaining: number;
  statusText: string;
  displaySubtitle: string;
  urgencyLevel: "overdue" | "due_soon" | "upcoming";
}

export interface IQuickActionItem {
  id: string;
  title: string;
  icon: string;
  route: string;
  badgeCount?: number;
}

export interface ILandlordHomeDashboardData {
  landlord: ILandlordProfileSummary;
  unreadNotificationsCount: number;
  incomeOverview: ILandlordMonthlyIncomeCard;
  financialOverview: ILandlordFinancialOverview;
  needsAttention: {
    totalCount: number;
    overdueRent: INeedsAttentionOverdueRent;
    tenantReports: INeedsAttentionTenantReports;
  };
  smartReminders: {
    items: ISmartReminderDashboardItem[];
  };
}
