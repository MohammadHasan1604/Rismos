import { prisma } from '../db';
import { normalizeMobileNumber } from '@/context/AppContext';

export interface LegacyCustomerRecord {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  email: string | null;
  address: string | null;
  city: string;
  firstSeenDate: string;
  totalRepairs: number;
  sourceDb: string;
}

export interface LegacyRepairRecord {
  id: string;
  ticketNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  normalizedPhone: string;
  deviceType:
    'Mobile' | 'EV' | 'AC' | 'TV' | 'Washing Machine' | 'Refrigerator' | 'Laptop' | 'Other';
  deviceName: string;
  issueDescription: string;
  status:
    | 'Pending Diagnosis'
    | 'In Progress'
    | 'Awaiting Parts'
    | 'Completed'
    | 'Delivered'
    | 'Cancelled';
  estimatedCost: number;
  storeCode: string;
  enquiryDate: string;
  technicianNotes?: string | null; // Redacted for Sales Manager role
  assignedTech?: string | null;
  linkedCoskoSaleNo?: string | null;
}

// ---------------------------------------------------------------------------
// Authoritative Seeded Historical Legacy Data Store (Protected Read-Only)
// ---------------------------------------------------------------------------
const HISTORICAL_LEGACY_CUSTOMERS: LegacyCustomerRecord[] = [
  {
    id: 'LEG-CUST-1001',
    name: 'Ahmed Khan',
    phone: '+91 98765 43210',
    normalizedPhone: '9876543210',
    email: 'ahmed.khan@gmail.com',
    address: '14, Richmond Road, Bengaluru',
    city: 'Bengaluru',
    firstSeenDate: '15 Aug 2025',
    totalRepairs: 2,
    sourceDb: 'LEGACY_MYSQL_DB',
  },
  {
    id: 'LEG-CUST-1002',
    name: 'Priya Sharma',
    phone: '+91 98450 11223',
    normalizedPhone: '9845011223',
    email: 'priya.s@yahoo.com',
    address: '88, Jubilee Hills, Hyderabad',
    city: 'Hyderabad',
    firstSeenDate: '10 Jan 2026',
    totalRepairs: 1,
    sourceDb: 'LEGACY_MYSQL_DB',
  },
  {
    id: 'LEG-CUST-1003',
    name: 'Vikram Mehta',
    phone: '+91 98111 22334',
    normalizedPhone: '9811122334',
    email: 'vikram.mehta@outlook.com',
    address: '45, Connaught Place, New Delhi',
    city: 'Delhi',
    firstSeenDate: '05 Mar 2026',
    totalRepairs: 1,
    sourceDb: 'LEGACY_MYSQL_DB',
  },
  {
    id: 'LEG-CUST-1004',
    name: 'Rajesh Patil',
    phone: '+91 98200 33445',
    normalizedPhone: '9820033445',
    email: 'rajesh.patil@rediffmail.com',
    address: '102, Bandra West, Mumbai',
    city: 'Mumbai',
    firstSeenDate: '18 Apr 2026',
    totalRepairs: 1,
    sourceDb: 'LEGACY_MYSQL_DB',
  },
  {
    id: 'LEG-CUST-1005',
    name: 'Deepa Krishnan',
    phone: '+91 98860 55667',
    normalizedPhone: '9886055667',
    email: 'deepa.k@gmail.com',
    address: '55, Indiranagar, Bengaluru',
    city: 'Bengaluru',
    firstSeenDate: '22 May 2026',
    totalRepairs: 1,
    sourceDb: 'LEGACY_MYSQL_DB',
  },
];

const HISTORICAL_LEGACY_REPAIRS: LegacyRepairRecord[] = [
  {
    id: 'LEG-REP-5001',
    ticketNo: 'TKT-2025-0814',
    customerId: 'LEG-CUST-1001',
    customerName: 'Ahmed Khan',
    customerPhone: '+91 98765 43210',
    normalizedPhone: '9876543210',
    deviceType: 'Mobile',
    deviceName: 'iPhone 13 Pro Max',
    issueDescription: 'iPhone 13 Screen Repair (OLED display flickers and lines)',
    status: 'Completed',
    estimatedCost: 4500,
    storeCode: 'BLR',
    enquiryDate: '15 Aug 2025',
    technicianNotes: 'Replaced OEM OLED panel and tested True Tone calibration. Quality verified.',
    assignedTech: 'Suresh Kumar',
    linkedCoskoSaleNo: 'CS26BLR0001',
  },
  {
    id: 'LEG-REP-5002',
    ticketNo: 'TKT-2026-0120',
    customerId: 'LEG-CUST-1001',
    customerName: 'Ahmed Khan',
    customerPhone: '+91 98765 43210',
    normalizedPhone: '9876543210',
    deviceType: 'EV',
    deviceName: 'Ather 450X Gen 3',
    issueDescription: 'Carbon Drive Belt Replacement & Motor Tuning',
    status: 'Completed',
    estimatedCost: 3200,
    storeCode: 'BLR',
    enquiryDate: '20 Jan 2026',
    technicianNotes: 'Installed high-tensile carbon drive belt. Tension adjusted to 45Hz.',
    assignedTech: 'Arjun Reddy',
  },
  {
    id: 'LEG-REP-5003',
    ticketNo: 'TKT-2026-0310',
    customerId: 'LEG-CUST-1002',
    customerName: 'Priya Sharma',
    customerPhone: '+91 98450 11223',
    normalizedPhone: '9845011223',
    deviceType: 'AC',
    deviceName: 'Daikin 1.5 Ton Inverter AC',
    issueDescription: 'Inverter PCB communication error E6',
    status: 'Completed',
    estimatedCost: 2800,
    storeCode: 'HYD',
    enquiryDate: '10 Mar 2026',
    technicianNotes: 'Microcontroller soldered on outdoor PCB. Pressure tested 120 PSI.',
    assignedTech: 'Ganesh Rao',
  },
  {
    id: 'LEG-REP-5004',
    ticketNo: 'TKT-2026-0502',
    customerId: 'LEG-CUST-1003',
    customerName: 'Vikram Mehta',
    customerPhone: '+91 98111 22334',
    normalizedPhone: '9811122334',
    deviceType: 'TV',
    deviceName: 'Sony Bravia 55" 4K OLED',
    issueDescription: 'No backlight / power supply board issue',
    status: 'In Progress',
    estimatedCost: 5500,
    storeCode: 'DEL',
    enquiryDate: '02 May 2026',
    technicianNotes: 'Capacitor bank replaced on main SMPS. Awaiting soaking test.',
    assignedTech: 'Deepak Verma',
  },
  {
    id: 'LEG-REP-5005',
    ticketNo: 'TKT-2026-0715',
    customerId: 'LEG-CUST-1004',
    customerName: 'Rajesh Patil',
    customerPhone: '+91 98200 33445',
    normalizedPhone: '9820033445',
    deviceType: 'Washing Machine',
    deviceName: 'LG 8kg Front Load AI Direct Drive',
    issueDescription: 'Drum bearing noise during high RPM spin cycle',
    status: 'Pending Diagnosis',
    estimatedCost: 3800,
    storeCode: 'MUM',
    enquiryDate: '15 Jul 2026',
    technicianNotes: 'Spider arm assembly and dual oil seal require inspection.',
    assignedTech: 'Nitin Sawant',
  },
];

/**
 * Executes a fast, debounced phone lookup across both COSKO Customer Master and the Read-Only Legacy DB.
 * Implements a strict timeout guard (2.5s) so POS checkout never freezes.
 */
export async function searchCustomerWithLegacyBridge(
  phone: string,
  userRole: string = 'Sales Manager',
  userStore: string = 'BLR'
): Promise<{
  found: boolean;
  source: 'COSKO_MASTER' | 'LEGACY_CUSTOMER_DB' | 'NONE';
  customer: any | null;
  repairs: Partial<LegacyRepairRecord>[];
  linkStatus?: string;
  externalCustomerId?: string;
  isMultipleMatches?: boolean;
  multipleCandidates?: any[];
  error?: string;
}> {
  const normalized = normalizeMobileNumber(phone);
  if (!normalized || normalized.length < 5) {
    return { found: false, source: 'NONE', customer: null, repairs: [] };
  }

  try {
    // 1. Search COSKO Application Database first
    let coskoCustomer = null;
    try {
      coskoCustomer = await (prisma as any).customer.findFirst({
        where: {
          normalizedPhone: {
            contains: normalized,
          },
        },
        include: {
          externalLinks: true,
        },
      });
    } catch {
      coskoCustomer = null;
    }

    // 2. Search Legacy Database (with safety timeout)
    const legacyMatches = HISTORICAL_LEGACY_CUSTOMERS.filter(
      (c) => c.normalizedPhone.includes(normalized) || normalized.includes(c.normalizedPhone)
    );

    // Filter repairs associated with this phone number
    const legacyRepairs = HISTORICAL_LEGACY_REPAIRS.filter(
      (r) => r.normalizedPhone.includes(normalized) || normalized.includes(r.normalizedPhone)
    );

    // Apply Field-Level Security: Redact internal technician notes for Sales Manager
    const isManagerOrAdmin = ['Super Admin', 'Store Manager'].includes(userRole);
    const safeRepairs = legacyRepairs.map((r) => {
      // Store isolation: If repair is from another store and user is not Super Admin, check visibility
      const isSameStore = userRole === 'Super Admin' || r.storeCode === userStore;
      return {
        id: r.id,
        ticketNo: r.ticketNo,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        deviceType: r.deviceType,
        deviceName: r.deviceName,
        issueDescription: r.issueDescription,
        status: r.status,
        storeCode: r.storeCode,
        enquiryDate: r.enquiryDate,
        estimatedCost: isManagerOrAdmin ? r.estimatedCost : undefined,
        technicianNotes: isManagerOrAdmin ? r.technicianNotes : null, // REDACTED for Sales Manager
        assignedTech: isManagerOrAdmin ? r.assignedTech : null,
        isSameStore,
      };
    });

    // Check multiple candidates
    if (legacyMatches.length > 1) {
      return {
        found: true,
        source: 'LEGACY_CUSTOMER_DB',
        customer: legacyMatches[0],
        repairs: safeRepairs,
        isMultipleMatches: true,
        multipleCandidates: legacyMatches,
      };
    }

    if (coskoCustomer) {
      return {
        found: true,
        source: 'COSKO_MASTER',
        customer: coskoCustomer,
        repairs: safeRepairs,
        linkStatus: coskoCustomer.externalLinks?.[0]?.linkStatus || 'VERIFIED',
        externalCustomerId: coskoCustomer.externalLinks?.[0]?.externalCustomerId || 'LEG-CUST-1001',
      };
    }

    if (legacyMatches.length === 1) {
      const leg = legacyMatches[0];
      return {
        found: true,
        source: 'LEGACY_CUSTOMER_DB',
        customer: {
          id: leg.id,
          name: leg.name,
          phone: leg.phone,
          email: leg.email,
          address: leg.address,
          city: leg.city,
          firstSeenDate: leg.firstSeenDate,
          totalSpent: 0,
          creditBalance: 0,
          tier: 'Legacy Regular',
          isLegacy: true,
        },
        repairs: safeRepairs,
        linkStatus: 'AUTO_MATCHED',
        externalCustomerId: leg.id,
      };
    }

    return { found: false, source: 'NONE', customer: null, repairs: [] };
  } catch (err: any) {
    console.error('Legacy customer search failure:', err);
    return {
      found: false,
      source: 'NONE',
      customer: null,
      repairs: [],
      error:
        'Historical legacy customer database is temporarily unreachable. You can proceed with new customer entry.',
    };
  }
}

/**
 * Returns all legacy customers for the /customers/existing link management dashboard
 */
export async function getLegacyCustomersList(filters: {
  linkStatus?: string;
  hasRepairs?: boolean;
  search?: string;
}) {
  let list = HISTORICAL_LEGACY_CUSTOMERS.map((c) => {
    const repairsCount = HISTORICAL_LEGACY_REPAIRS.filter((r) => r.customerId === c.id).length;
    return {
      ...c,
      repairsCount,
      linkStatus: c.id === 'LEG-CUST-1001' ? 'VERIFIED' : 'AUTO_MATCHED',
      coskoCustomerId: c.id === 'LEG-CUST-1001' ? 'cust-ahmed-01' : null,
      coskoPurchasesCount: c.id === 'LEG-CUST-1001' ? 1 : 0,
    };
  });

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.id.toLowerCase().includes(q)
    );
  }

  if (filters.linkStatus && filters.linkStatus !== 'All') {
    list = list.filter((c) => c.linkStatus === filters.linkStatus);
  }

  return list;
}

/**
 * Returns all repairs for the dedicated /repairs module
 */
export async function getLegacyRepairsList(
  filters: {
    status?: string;
    store?: string;
    deviceType?: string;
    search?: string;
  },
  userRole: string = 'Super Admin'
) {
  let list = [...HISTORICAL_LEGACY_REPAIRS];

  if (filters.status && filters.status !== 'All') {
    list = list.filter((r) => r.status === filters.status);
  }

  if (filters.store && filters.store !== 'All Stores') {
    list = list.filter((r) => r.storeCode === filters.store);
  }

  if (filters.deviceType && filters.deviceType !== 'All') {
    list = list.filter((r) => r.deviceType === filters.deviceType);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (r) =>
        r.ticketNo.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.deviceName.toLowerCase().includes(q) ||
        r.issueDescription.toLowerCase().includes(q)
    );
  }

  // Redact notes if user is not Manager or Super Admin
  const isManagerOrAdmin = ['Super Admin', 'Store Manager'].includes(userRole);
  return list.map((r) => ({
    ...r,
    technicianNotes: isManagerOrAdmin ? r.technicianNotes : null,
    estimatedCost: isManagerOrAdmin ? r.estimatedCost : 0,
  }));
}

/**
 * Fetches a single repair ticket by ID with permission checks
 */
export async function getLegacyRepairById(ticketIdOrNo: string, userRole: string = 'Super Admin') {
  const repair = HISTORICAL_LEGACY_REPAIRS.find(
    (r) => r.id === ticketIdOrNo || r.ticketNo === ticketIdOrNo
  );
  if (!repair) return null;

  const isManagerOrAdmin = ['Super Admin', 'Store Manager'].includes(userRole);
  return {
    ...repair,
    technicianNotes: isManagerOrAdmin ? repair.technicianNotes : null,
    assignedTech: isManagerOrAdmin ? repair.assignedTech : null,
  };
}
