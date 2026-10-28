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

// ==========================================
// Admin Landlord Management Interfaces
// ==========================================

export interface IAdminLandlordPortfolio {
  propertiesCount: number;
  unitsCount: number;
  maxUnits: number | null;
  formattedPortfolio: string; // e.g. "3 Properties"
  formattedUnits: string; // e.g. "7 / 20 units" or "1 / 5 units"
  isNearLimit: boolean;
}

export interface IAdminLandlordPlan {
  packageName: string;
  price: number;
  formattedPrice: string; // e.g. "$19/mo", "Free"
  billingCadence: "monthly" | "yearly" | "free";
  isTrial: boolean;
  status: string;
}

export interface IAdminLandlordListItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  initials: string;
  portfolio: IAdminLandlordPortfolio;
  plan: IAdminLandlordPlan | null;
  status: "active" | "trial" | "past_due" | "suspended";
  rawStatus: "active" | "inactive";
  statusBadge: {
    label: string;
    variant: "success" | "warning" | "danger" | "neutral";
  };
  joinedDate: string; // "Jun 22, 2025"
  createdAt: Date | string;
}

export interface IAdminLandlordsSummary {
  allCount: number;
  activeCount: number;
  trialCount: number;
  pastDueCount: number;
  suspendedCount: number;
}

export interface IAdminLandlordsResponse {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: IAdminLandlordsSummary;
  data: IAdminLandlordListItem[];
}

export interface IAdminLandlordOverviewStats {
  managedProperties: number;
  rentalUnits: number;
  activeTenants: number;
  assignedContractors: number;
}

export interface IAdminLandlordDetail {
  id: string;
  displayId: string; // "ID: #11"
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  initials: string;
  address?: string;
  status: "active" | "suspended";
  statusBadge: "Active Landlord" | "Suspended Landlord";
  joinedDate: string;
  createdAt: Date | string;
  plan: {
    packageName: string;
    price: string;
    nextRenewal: string;
    billingCadence: string;
    paymentMethod: string;
    complianceStanding: string;
    features: string[];
    isTrial: boolean;
    status: string;
  } | null;
  stats: IAdminLandlordOverviewStats;
}

export interface IAdminPropertyUnitItem {
  id: string;
  unitName: string;
  unitType: string;
  beds?: number;
  baths?: number;
  floor: string;
  rentPerMonth: number;
  formattedRent: string;
  isOccupied: boolean;
  status: "Occupied" | "Vacant";
  occupant: string;
  tenant?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
}

export interface IAdminPropertyItem {
  id: string;
  propertyName: string;
  thumbnail?: string;
  propertyPhotos: string[];
  streetAddress: string;
  postCode: string;
  fullAddress: string;
  unitsBadge: string;
  epcRating: string;
  cp12Status: string;
  cp12Valid: boolean;
  totalUnits: number;
  occupiedUnits: number;
  occupancyPercentage: number;
  occupancyText: string;
  units: IAdminPropertyUnitItem[];
}

export interface IAdminTenantItem {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  initials: string;
  property: {
    id: string;
    propertyName: string;
    streetAddress: string;
  };
  unit: {
    id: string;
    unitName: string;
  };
  propertyUnitText: string;
  contract: string;
  status: string;
  leaseStartDate: Date | string;
  leaseEndDate: Date | string;
  moveInDate: string;
  rentAmount: number;
  formattedRent: string;
  tenantAccountStatus: "active" | "inactive";
}

export interface IAdminContractorItem {
  id: string;
  contractorId: string;
  name: string;
  companyName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  initials: string;
  trades: string[];
  primaryTrade: string;
  status: string;
  rating?: number;
  activeJobs: number;
  activeJobsText: string;
}

export interface IAdminLandlordFullDetails {
  landlord: IAdminLandlordDetail;
  properties: IAdminPropertyItem[];
  tenants: IAdminTenantItem[];
  contractors: IAdminContractorItem[];
}

export interface IAdminCascadeActionResult {
  landlordId: string;
  action: "suspend" | "activate" | "delete";
  landlordStatus: string;
  affectedTenantsCount?: number;
  affectedContractorsCount?: number;
  affectedPropertiesCount?: number;
  affectedFlatsCount?: number;
  message: string;
}

// ==========================================
// Admin Transactions Interfaces
// ==========================================

export interface IAdminTransactionStats {
  totalCollected: number;
  formattedTotalCollected: string;
  currency: string;
  currencySymbol: string;
  totalTransactions: number;
  payingLandlords: number;
}

export interface IAdminTransactionLandlord {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
}

export interface IAdminTransactionItem {
  id: string;
  transactionId: string;
  invoiceNumber: string;
  landlord: IAdminTransactionLandlord;
  plan: string;
  billing: "Monthly" | "Yearly";
  amount: number;
  formattedAmount: string;
  currency: string;
  currencySymbol: string;
  method: string;
  status: "Completed" | "Failed";
  date: string;
  formattedDate: string;
  invoiceUrl: string;
  invoicePdf: string;
}

export interface IAdminTransactionQuery {
  page?: number | string;
  limit?: number | string;
  status?: string; // "all" | "completed" | "failed"
  dateRange?: string; // "all_time" | "today" | "this_week" | "this_month" | "this_year"
  range?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
  search?: string;
  q?: string;
  export?: boolean | string;
}

export interface IAdminTransactionsResponse {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPage: number;
  };
  data: IAdminTransactionItem[];
}
