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

export interface INeedsAttentionItem {
  type: "overdue_rent" | "tenant_reports";
  count: number;
  title: string;
  subtitle: string;
  amount?: number;
  formattedAmount?: string;
  actionRoute: string;
  items?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    amount?: number;
    date?: Date | string;
    priority?: string;
  }>;
}

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
  quickActions: IQuickActionItem[];
  needsAttention: {
    totalCount: number;
    overdueRent: INeedsAttentionItem;
    tenantReports: INeedsAttentionItem;
    items: INeedsAttentionItem[];
  };
  smartReminders: {
    totalCount: number;
    overdueCount: number;
    dueSoonCount: number;
    items: ISmartReminderDashboardItem[];
  };
}
