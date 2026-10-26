export interface IAdminDashboardStats {
  totalLandlords: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
}

export interface IMonthlyRevenueItem {
  month: string;
  revenue: number;
}

export interface IAdminMonthlyRevenueResponse {
  year: number;
  totalRevenue: number;
  revenue: IMonthlyRevenueItem[];
}

export interface IUserGrowthItem {
  month: string;
  landlords: number;
  tenants: number;
  contractors: number;
  total: number;
  newLandlords?: number;
  newTenants?: number;
  newContractors?: number;
}

export interface IAdminUserGrowthResponse {
  year: number;
  growth: IUserGrowthItem[];
}
