export type PaymentType = 'PIX' | 'DINHEIRO';
export type ActiveBillStatus = 'UNPAID' | 'PAID' | 'ERROR';
export type ValueSourceType = 'TABLE' | 'EMAIL' | 'API';
export type BillType = 'RECURRENT_SERVICE' | 'PURCHASE';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';

export interface SessionUser {
  _id: string;
  name: string;
  email: string;
  admin: boolean;
  status: EntityStatus;
}

export interface SessionInfo {
  authRequired: boolean;
  authDisabled: boolean;
  authenticated: boolean;
  user: SessionUser | null;
  isAdmin: boolean;
  actorName: string;
  csrfToken?: string;
  vapidPublicKey?: string | null;
}

export interface ResidentUser {
  _id: string;
  name: string;
  email: string;
  admin: boolean;
  status: EntityStatus;
  hasAssignedBills?: boolean;
}

export interface ActiveBillItem {
  _id: string;
  billId: string | null;
  name: string;
  company: string;
  users: string[];
  dueDate: string | null;
  value: number | null;
  prevValue: number | null;
  icon: string;
  status: ActiveBillStatus;
  paymentType: PaymentType;
  referencePeriod: string;
  valueSourceType: ValueSourceType | string;
  attachmentFilename: string;
  hasPdf: boolean;
  pdfUrl: string | null;
  pixCode: string;
  barcode: string;
  notes: string;
  paidAt: string | null;
  paidBy: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ConfiguredBill {
  _id: string;
  name: string;
  company: string;
  type: BillType;
  valueSourceType: ValueSourceType;
  valueSourceId: string;
  dueDay: number;
  icon: string;
  pixKey: string;
  category: string;
  paymentType: PaymentType;
  status: EntityStatus;
  users: string[];
}

export interface TableEntry {
  period: { month: number; year: number };
  value: number;
}

export interface TableSource {
  _id: string;
  name: string;
  status: EntityStatus;
  data: TableEntry[];
}

export interface EmailSource {
  _id: string;
  address: string;
  subject: string;
  dataParser: string;
  status: EntityStatus;
}

export interface ApiSource {
  _id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: string;
  value: string;
  status: EntityStatus;
}

export interface AvailablePdfFile {
  filename: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface BootstrapPayload {
  session: SessionInfo;
  activeBills: ActiveBillItem[];
  users: ResidentUser[];
  bills: ConfiguredBill[];
  sources: {
    tables: TableSource[];
    emails: EmailSource[];
    apis: ApiSource[];
    availablePdfs: AvailablePdfFile[];
  };
  enums: Record<string, Record<string, string>>;
  lastUpdate: string | null;
}

export interface SyncProgressEvent {
  stage: 'started' | 'source_done' | 'bill_saved' | 'completed' | 'error';
  billCount?: number;
  counts?: { table: number; email: number; api: number };
  source?: 'TABLE' | 'EMAIL' | 'API';
  count?: number;
  name?: string;
  referencePeriod?: string;
  value?: number;
  hasPdf?: boolean;
  processedCount?: number;
  message?: string;
}

export interface ReportSummaryResponse {
  report: {
    filters: {
      userId: string;
      userName: string;
      startPeriod: string;
      endPeriod: string;
      startLabel: string | null;
      endLabel: string | null;
    };
    summary: {
      totalBills: number;
      monthsCount: number;
      totalValue: number;
      paidValue: number;
      paidCount: number;
      unpaidValue: number;
      unpaidCount: number;
      errorCount: number;
      byPaymentType: Array<{ type: string; label: string; total: number; count: number }>;
    };
    userBreakdown: Array<{
      userId: string;
      userName: string;
      billCount: number;
      sharedBillCount: number;
      totalShare: number;
      paidShare: number;
      unpaidShare: number;
      byPaymentType: Array<{ type: string; label: string; total: number; count: number }>;
    }>;
    months: Array<{
      month: string;
      formattedMonth: string;
      billCount: number;
      totalValue: number;
      paidValue: number;
      unpaidValue: number;
      paymentTypeSummaries: Array<{ type: string; label: string; total: number; count: number }>;
      bills: Array<{
        _id: string;
        name: string;
        formattedDueDate: string;
        paymentType: string;
        paymentTypeLabel: string;
        status: ActiveBillStatus;
        statusLabel: string;
        userNames: string[];
        userCount: number;
        isShared: boolean;
        fullValue: number | null;
        effectiveValue: number | null;
      }>;
    }>;
  };
  generatedAt: string;
  exportCsvUrl: string;
}
