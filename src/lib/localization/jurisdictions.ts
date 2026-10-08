/**
 * International Jurisdiction & Tax Engine - Launch Profiles
 *
 * Provides extensible jurisdiction specifications for supported retail regions:
 * - India (IN): GST, CGST, SGST, IGST, UTGST, HSN/SAC, 15-char GSTIN
 * - United Arab Emirates (AE): UAE VAT 5%, TRN, FTA-compliant
 * - Saudi Arabia (SA): VAT 15%, ZATCA-ready tax registration
 * - United Kingdom (GB): HMRC VAT (standard 20%, reduced 5%, zero 0%), VAT Reg #
 * - United States (US): State & Local Sales Tax abstraction (no fake national VAT rate!)
 * - Australia (AU): ATO GST 10%, ABN
 * - South Africa (ZA): SARS VAT 15%, VAT Number
 */

export interface JurisdictionProfile {
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  defaultCurrencyCode: string; // ISO 4217
  defaultCurrencySymbol: string;
  defaultLocale: string;
  defaultTimezone: string;
  taxRegime: string;
  taxLabel: string;
  defaultTaxRate: number;
  standardTaxRates: number[];
  taxIdLabel: string;
  taxIdPlaceholder: string;
  taxIdRegex?: RegExp;
  hasStateTaxBreakdown: boolean;
  hasHsnSac: boolean;
  taxInclusivePricingMode: boolean; // default pricing mode
  registrationTypes: string[];
  subdivisions?: Array<{ code: string; name: string }>;
  description: string;
}

export const LAUNCH_JURISDICTIONS: Record<string, JurisdictionProfile> = {
  IN: {
    countryCode: 'IN',
    countryName: 'India',
    defaultCurrencyCode: 'INR',
    defaultCurrencySymbol: '₹',
    defaultLocale: 'en-IN',
    defaultTimezone: 'Asia/Kolkata',
    taxRegime: 'GST',
    taxLabel: 'GST',
    defaultTaxRate: 18,
    standardTaxRates: [0, 5, 12, 18, 28],
    taxIdLabel: 'GSTIN (Goods and Services Tax ID)',
    taxIdPlaceholder: '29AABCU9603R1ZM',
    taxIdRegex: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z0-9A-Z]{1}[0-9A-Z]{1}$/,
    hasStateTaxBreakdown: true, // CGST + SGST or IGST
    hasHsnSac: true,
    taxInclusivePricingMode: true,
    registrationTypes: [
      'Regular',
      'Composition',
      'SEZ Unit',
      'SEZ Developer',
      'Input Service Distributor',
      'Casual Taxable Person',
    ],
    subdivisions: [
      { code: '01', name: 'Jammu & Kashmir' },
      { code: '02', name: 'Himachal Pradesh' },
      { code: '03', name: 'Punjab' },
      { code: '04', name: 'Chandigarh' },
      { code: '05', name: 'Uttarakhand' },
      { code: '06', name: 'Haryana' },
      { code: '07', name: 'Delhi' },
      { code: '08', name: 'Rajasthan' },
      { code: '09', name: 'Uttar Pradesh' },
      { code: '10', name: 'Bihar' },
      { code: '11', name: 'Sikkim' },
      { code: '12', name: 'Arunachal Pradesh' },
      { code: '13', name: 'Nagaland' },
      { code: '14', name: 'Manipur' },
      { code: '15', name: 'Mizoram' },
      { code: '16', name: 'Tripura' },
      { code: '17', name: 'Meghalaya' },
      { code: '18', name: 'Assam' },
      { code: '19', name: 'West Bengal' },
      { code: '20', name: 'Jharkhand' },
      { code: '21', name: 'Odisha' },
      { code: '22', name: 'Chhattisgarh' },
      { code: '23', name: 'Madhya Pradesh' },
      { code: '24', name: 'Gujarat' },
      { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
      { code: '27', name: 'Maharashtra' },
      { code: '29', name: 'Karnataka' },
      { code: '30', name: 'Goa' },
      { code: '31', name: 'Lakshadweep' },
      { code: '32', name: 'Kerala' },
      { code: '33', name: 'Tamil Nadu' },
      { code: '34', name: 'Puducherry' },
      { code: '35', name: 'Andaman & Nicobar Islands' },
      { code: '36', name: 'Telangana' },
      { code: '37', name: 'Andhra Pradesh' },
      { code: '38', name: 'Ladakh' },
    ],
    description: 'Central and State GST framework with CGST/SGST intrastate and IGST interstate splits.',
  },

  AE: {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    defaultCurrencyCode: 'AED',
    defaultCurrencySymbol: 'AED',
    defaultLocale: 'en-AE',
    defaultTimezone: 'Asia/Dubai',
    taxRegime: 'VAT',
    taxLabel: 'VAT',
    defaultTaxRate: 5,
    standardTaxRates: [0, 5],
    taxIdLabel: 'TRN (Tax Registration Number)',
    taxIdPlaceholder: '100XXXXXXXXX003',
    taxIdRegex: /^100[0-9]{12}$/,
    hasStateTaxBreakdown: false,
    hasHsnSac: false,
    taxInclusivePricingMode: true,
    registrationTypes: ['Standard Taxable Person', 'Designated Zone', 'Tax Group'],
    subdivisions: [
      { code: 'DXB', name: 'Dubai' },
      { code: 'AUH', name: 'Abu Dhabi' },
      { code: 'SHJ', name: 'Sharjah' },
      { code: 'AJM', name: 'Ajman' },
      { code: 'RAK', name: 'Ras Al Khaimah' },
      { code: 'FUJ', name: 'Fujairah' },
      { code: 'UAQ', name: 'Umm Al Quwain' },
    ],
    description: 'Federal Tax Authority (FTA) unified VAT rules across all 7 Emirates at standard 5%.',
  },

  SA: {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    defaultCurrencyCode: 'SAR',
    defaultCurrencySymbol: 'SAR',
    defaultLocale: 'en-SA',
    defaultTimezone: 'Asia/Riyadh',
    taxRegime: 'VAT',
    taxLabel: 'VAT',
    defaultTaxRate: 15,
    standardTaxRates: [0, 15],
    taxIdLabel: 'VAT Number (ZATCA Registration)',
    taxIdPlaceholder: '300XXXXXXXXX003',
    taxIdRegex: /^3[0-9]{13}3$/,
    hasStateTaxBreakdown: false,
    hasHsnSac: false,
    taxInclusivePricingMode: true,
    registrationTypes: ['Standard Taxpayer', 'Export Exempt', 'ZATCA Phase 2 E-Invoice'],
    subdivisions: [
      { code: 'RD', name: 'Riyadh' },
      { code: 'MK', name: 'Makkah' },
      { code: 'MD', name: 'Madinah' },
      { code: 'EP', name: 'Eastern Province' },
      { code: 'AS', name: 'Asir' },
      { code: 'TB', name: 'Tabuk' },
      { code: 'QA', name: 'Al-Qassim' },
    ],
    description: 'ZATCA value-added tax at 15% standard rate with cryptographic e-invoicing readiness.',
  },

  GB: {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    defaultCurrencyCode: 'GBP',
    defaultCurrencySymbol: '£',
    defaultLocale: 'en-GB',
    defaultTimezone: 'Europe/London',
    taxRegime: 'VAT',
    taxLabel: 'VAT',
    defaultTaxRate: 20,
    standardTaxRates: [0, 5, 20],
    taxIdLabel: 'HMRC VAT Registration Number',
    taxIdPlaceholder: 'GB 123 4567 89',
    taxIdRegex: /^(GB)?\s?[0-9]{9,12}$/i,
    hasStateTaxBreakdown: false,
    hasHsnSac: false,
    taxInclusivePricingMode: true,
    registrationTypes: ['Standard Rate (20%)', 'Reduced Rate (5%)', 'Zero-Rated (0%)', 'Exempt'],
    subdivisions: [
      { code: 'ENG', name: 'England' },
      { code: 'SCT', name: 'Scotland' },
      { code: 'WLS', name: 'Wales' },
      { code: 'NIR', name: 'Northern Ireland' },
    ],
    description: 'HM Revenue & Customs VAT with standard (20%), reduced domestic (5%), and zero-rated tiers.',
  },

  US: {
    countryCode: 'US',
    countryName: 'United States',
    defaultCurrencyCode: 'USD',
    defaultCurrencySymbol: '$',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/New_York',
    taxRegime: 'Sales Tax',
    taxLabel: 'Sales Tax',
    defaultTaxRate: 0, // No universal federal sales tax; explicit state/local rate required per store/state
    standardTaxRates: [0, 4, 6, 7, 8.25, 8.875, 9.5],
    taxIdLabel: 'Federal EIN / State Tax Permit',
    taxIdPlaceholder: '12-3456789',
    taxIdRegex: /^[0-9]{2}-?[0-9]{7}$/,
    hasStateTaxBreakdown: true, // State tax + County/City local tax
    hasHsnSac: false,
    taxInclusivePricingMode: false, // US shelf pricing is strictly tax-exclusive
    registrationTypes: ['State Registered Retailer', 'Reseller Certificate (Exempt)', 'Nexus Out-of-State'],
    subdivisions: [
      { code: 'CA', name: 'California' },
      { code: 'TX', name: 'Texas' },
      { code: 'NY', name: 'New York' },
      { code: 'FL', name: 'Florida' },
      { code: 'IL', name: 'Illinois' },
      { code: 'WA', name: 'Washington' },
      { code: 'MA', name: 'Massachusetts' },
      { code: 'NJ', name: 'New Jersey' },
      { code: 'GA', name: 'Georgia' },
      { code: 'NC', name: 'North Carolina' },
      { code: 'PA', name: 'Pennsylvania' },
      { code: 'OH', name: 'Ohio' },
      { code: 'DE', name: 'Delaware (0% Sales Tax)' },
      { code: 'OR', name: 'Oregon (0% Sales Tax)' },
      { code: 'NH', name: 'New Hampshire (0% Sales Tax)' },
      { code: 'MT', name: 'Montana (0% Sales Tax)' },
    ],
    description: 'State and local jurisdiction sales tax engine. Shelf prices are exclusive; tax calculated at checkout.',
  },

  AU: {
    countryCode: 'AU',
    countryName: 'Australia',
    defaultCurrencyCode: 'AUD',
    defaultCurrencySymbol: 'A$',
    defaultLocale: 'en-AU',
    defaultTimezone: 'Australia/Sydney',
    taxRegime: 'GST',
    taxLabel: 'GST',
    defaultTaxRate: 10,
    standardTaxRates: [0, 10],
    taxIdLabel: 'ABN (Australian Business Number)',
    taxIdPlaceholder: '51 824 753 556',
    taxIdRegex: /^[0-9]{2}\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/,
    hasStateTaxBreakdown: false,
    hasHsnSac: false,
    taxInclusivePricingMode: true,
    registrationTypes: ['Standard GST Registered', 'GST-Free', 'Input Taxed'],
    subdivisions: [
      { code: 'NSW', name: 'New South Wales' },
      { code: 'VIC', name: 'Victoria' },
      { code: 'QLD', name: 'Queensland' },
      { code: 'WA', name: 'Western Australia' },
      { code: 'SA', name: 'South Australia' },
      { code: 'TAS', name: 'Tasmania' },
      { code: 'ACT', name: 'Australian Capital Territory' },
      { code: 'NT', name: 'Northern Territory' },
    ],
    description: 'Australian Taxation Office unified GST at 10% standard rate across all states and territories.',
  },

  ZA: {
    countryCode: 'ZA',
    countryName: 'South Africa',
    defaultCurrencyCode: 'ZAR',
    defaultCurrencySymbol: 'R',
    defaultLocale: 'en-ZA',
    defaultTimezone: 'Africa/Johannesburg',
    taxRegime: 'VAT',
    taxLabel: 'VAT',
    defaultTaxRate: 15,
    standardTaxRates: [0, 15],
    taxIdLabel: 'SARS VAT Registration Number',
    taxIdPlaceholder: '4123456789',
    taxIdRegex: /^4[0-9]{9}$/,
    hasStateTaxBreakdown: false,
    hasHsnSac: false,
    taxInclusivePricingMode: true,
    registrationTypes: ['Standard Rate (15%)', 'Zero-Rated (0%)', 'Exempt Supplies'],
    subdivisions: [
      { code: 'GP', name: 'Gauteng' },
      { code: 'WC', name: 'Western Cape' },
      { code: 'KZN', name: 'KwaZulu-Natal' },
      { code: 'EC', name: 'Eastern Cape' },
      { code: 'FS', name: 'Free State' },
      { code: 'LP', name: 'Limpopo' },
      { code: 'MP', name: 'Mpumalanga' },
      { code: 'NC', name: 'Northern Cape' },
      { code: 'NW', name: 'North West' },
    ],
    description: 'South African Revenue Service (SARS) VAT at standard 15% rate with mandatory Tax Invoice title.',
  },
};

/**
 * Returns canonical jurisdiction profile for a given ISO country code
 */
export function getJurisdictionProfile(code?: string | null): JurisdictionProfile {
  const normalized = (code || 'IN').toUpperCase().trim();
  return LAUNCH_JURISDICTIONS[normalized] || LAUNCH_JURISDICTIONS.IN;
}

/**
 * Returns all supported jurisdiction profiles as an array
 */
export function getAllJurisdictions(): JurisdictionProfile[] {
  return Object.values(LAUNCH_JURISDICTIONS);
}
