/**
 * Comprehensive geolocation normalization, cross-country mismatch detection,
 * province/state code translation, and city-country validity enforcement.
 */

// Major international cities mapped to their valid ISO 3166-1 alpha-2 country codes.
export const MAJOR_CITY_COUNTRY_MAP: Record<string, string[]> = {
  // Netherlands
  amsterdam: ['NL'],
  rotterdam: ['NL'],
  'the hague': ['NL'],
  'den haag': ['NL'],
  utrecht: ['NL'],
  eindhoven: ['NL'],
  groningen: ['NL'],
  haarlem: ['NL'],

  // France
  paris: ['FR'],
  marseille: ['FR'],
  lyon: ['FR'],
  toulouse: ['FR'],
  nice: ['FR'],
  nantes: ['FR'],
  strasbourg: ['FR'],
  bordeaux: ['FR'],
  lille: ['FR'],

  // United Kingdom
  london: ['GB', 'CA'], // London, Ontario in Canada
  manchester: ['GB', 'US'],
  birmingham: ['GB', 'US'],
  edinburgh: ['GB'],
  glasgow: ['GB'],
  liverpool: ['GB'],
  bristol: ['GB'],
  leeds: ['GB'],

  // Germany
  berlin: ['DE'],
  frankfurt: ['DE'],
  munich: ['DE'],
  'münchen': ['DE'],
  hamburg: ['DE'],
  cologne: ['DE'],
  'köln': ['DE'],
  stuttgart: ['DE'],
  'düsseldorf': ['DE'],
  leipzig: ['DE'],
  dortmund: ['DE'],

  // Italy
  rome: ['IT'],
  roma: ['IT'],
  milan: ['IT'],
  milano: ['IT'],
  naples: ['IT'],
  napoli: ['IT'],
  turin: ['IT'],
  torino: ['IT'],
  florence: ['IT'],
  firenze: ['IT'],
  venice: ['IT'],
  venezia: ['IT'],

  // Spain
  madrid: ['ES'],
  barcelona: ['ES'],
  valencia: ['ES'],
  seville: ['ES'],
  sevilla: ['ES'],
  zaragoza: ['ES'],
  malaga: ['ES'],
  'málaga': ['ES'],

  // Japan
  tokyo: ['JP'],
  osaka: ['JP'],
  kyoto: ['JP'],
  yokohama: ['JP'],
  nagoya: ['JP'],
  sapporo: ['JP'],
  fukuoka: ['JP'],
  kobe: ['JP'],

  // China
  beijing: ['CN'],
  shanghai: ['CN'],
  guangzhou: ['CN'],
  shenzhen: ['CN'],
  wuhan: ['CN'],
  shizishan: ['CN'],
  chengdu: ['CN'],
  hangzhou: ['CN'],
  chongqing: ['CN'],
  nanjing: ['CN'],
  "xi'an": ['CN'],
  xian: ['CN'],
  tianjin: ['CN'],
  suzhou: ['CN'],
  zhengzhou: ['CN'],
  changsha: ['CN'],
  dongguan: ['CN'],
  shijiazhuang: ['CN'],
  hefei: ['CN'],
  kunming: ['CN'],
  fuzhou: ['CN'],
  harbin: ['CN'],
  jinan: ['CN'],
  shenyang: ['CN'],
  qingdao: ['CN'],
  dalian: ['CN'],
  xiamen: ['CN'],

  // Indonesia
  jakarta: ['ID'],
  surabaya: ['ID'],
  bandung: ['ID'],
  medan: ['ID'],
  semarang: ['ID'],
  makassar: ['ID'],
  palembang: ['ID'],
  tangerang: ['ID'],
  depok: ['ID'],
  denpasar: ['ID'],
  yogyakarta: ['ID'],
  batam: ['ID'],
  bogor: ['ID'],
  padang: ['ID'],
  malang: ['ID'],
  samarinda: ['ID'],
  banjarmasin: ['ID'],
  balikpapan: ['ID'],
  pontianak: ['ID'],
  manado: ['ID'],
  mataram: ['ID'],
  kupang: ['ID'],
  jayapura: ['ID'],
  ambon: ['ID'],

  // South Korea
  seoul: ['KR'],
  busan: ['KR'],
  incheon: ['KR'],
  daegu: ['KR'],
  daejeon: ['KR'],
  gwangju: ['KR'],

  // Singapore
  singapore: ['SG'],

  // Malaysia
  'kuala lumpur': ['MY'],
  'george town': ['MY'],
  'johor bahru': ['MY'],
  ipoh: ['MY'],
  'shah alam': ['MY'],
  'petaling jaya': ['MY'],
  'kota kinabalu': ['MY'],
  kuching: ['MY'],

  // Thailand
  bangkok: ['TH'],
  'chiang mai': ['TH'],
  phuket: ['TH'],
  pattaya: ['TH'],

  // Vietnam
  hanoi: ['VN'],
  'ho chi minh city': ['VN'],
  'da nang': ['VN'],
  'hai phong': ['VN'],

  // Philippines
  manila: ['PH'],
  'quezon city': ['PH'],
  'davao city': ['PH'],
  'cebu city': ['PH'],

  // Australia
  sydney: ['AU'],
  melbourne: ['AU'],
  brisbane: ['AU'],
  perth: ['AU'],
  adelaide: ['AU'],
  'gold coast': ['AU'],
  canberra: ['AU'],

  // New Zealand
  auckland: ['NZ'],
  wellington: ['NZ'],
  christchurch: ['NZ'],

  // Canada
  toronto: ['CA'],
  montreal: ['CA'],
  'montréal': ['CA'],
  vancouver: ['CA'],
  calgary: ['CA'],
  edmonton: ['CA'],
  ottawa: ['CA'],
  quebec: ['CA'],
  winnipeg: ['CA'],

  // Russia
  moscow: ['RU'],
  'saint petersburg': ['RU'],
  'st petersburg': ['RU'],
  novosibirsk: ['RU'],
  yekaterinburg: ['RU'],

  // United States
  'new york': ['US'],
  'los angeles': ['US'],
  chicago: ['US'],
  houston: ['US'],
  phoenix: ['US'],
  philadelphia: ['US'],
  'san antonio': ['US'],
  'san diego': ['US'],
  dallas: ['US'],
  'san jose': ['US'],
  austin: ['US'],
  seattle: ['US'],
  denver: ['US'],
  boston: ['US'],
  atlanta: ['US'],
  miami: ['US'],
  'san francisco': ['US'],
  ashburn: ['US'],

  // India
  mumbai: ['IN'],
  delhi: ['IN'],
  'new delhi': ['IN'],
  bangalore: ['IN'],
  bengaluru: ['IN'],
  hyderabad: ['IN'],
  ahmedabad: ['IN'],
  chennai: ['IN'],
  kolkata: ['IN'],
  pune: ['IN'],

  // Taiwan
  taipei: ['TW'],
  kaohsiung: ['TW'],
  taichung: ['TW'],
  tainan: ['TW'],

  // Hong Kong & Macau
  'hong kong': ['HK'],
  macau: ['MO'],
  macao: ['MO'],
};

// Province and state codes mapped to full English region names for key countries.
export const REGION_CODE_MAP: Record<string, Record<string, string>> = {
  // China (CN)
  CN: {
    BJ: 'Beijing',
    TJ: 'Tianjin',
    HE: 'Hebei',
    SX: 'Shanxi',
    NM: 'Inner Mongolia',
    LN: 'Liaoning',
    JL: 'Jilin',
    HL: 'Heilongjiang',
    SH: 'Shanghai',
    JS: 'Jiangsu',
    ZJ: 'Zhejiang',
    AH: 'Anhui',
    FJ: 'Fujian',
    JX: 'Jiangxi',
    SD: 'Shandong',
    HA: 'Henan',
    HEN: 'Henan',
    HB: 'Hubei',
    HUB: 'Hubei',
    HN: 'Hunan',
    HUN: 'Hunan',
    GD: 'Guangdong',
    GX: 'Guangxi',
    HI: 'Hainan',
    CQ: 'Chongqing',
    SC: 'Sichuan',
    GZ: 'Guizhou',
    YN: 'Yunnan',
    XZ: 'Tibet',
    SN: 'Shaanxi',
    SAA: 'Shaanxi',
    GS: 'Gansu',
    QH: 'Qinghai',
    NX: 'Ningxia',
    XJ: 'Xinjiang',
    TW: 'Taiwan',
    HK: 'Hong Kong',
    MO: 'Macau',
  },

  // Indonesia (ID)
  ID: {
    JK: 'Jakarta',
    JB: 'Jawa Barat',
    JT: 'Jawa Tengah',
    JI: 'Jawa Timur',
    BT: 'Banten',
    YO: 'DI Yogyakarta',
    BA: 'Bali',
    AC: 'Aceh',
    SU: 'Sumatera Utara',
    SB: 'Sumatera Barat',
    RI: 'Riau',
    KR: 'Kepulauan Riau',
    JA: 'Jambi',
    SS: 'Sumatera Selatan',
    BE: 'Bengkulu',
    LA: 'Lampung',
    BB: 'Bangka Belitung',
    KB: 'Kalimantan Barat',
    KT: 'Kalimantan Tengah',
    KS: 'Kalimantan Selatan',
    KI: 'Kalimantan Timur',
    KU: 'Kalimantan Utara',
    SA: 'Sulawesi Utara',
    ST: 'Sulawesi Tengah',
    SN: 'Sulawesi Selatan',
    SG: 'Sulawesi Tenggara',
    GO: 'Gorontalo',
    SR: 'Sulawesi Barat',
    MA: 'Maluku',
    MU: 'Maluku Utara',
    PA: 'Papua',
    PB: 'Papua Barat',
  },

  // Netherlands (NL)
  NL: {
    DR: 'Drenthe',
    FL: 'Flevoland',
    FR: 'Friesland',
    GE: 'Gelderland',
    GR: 'Groningen',
    LI: 'Limburg',
    NB: 'Noord-Brabant',
    NH: 'Noord-Holland',
    OV: 'Overijssel',
    UT: 'Utrecht',
    ZE: 'Zeeland',
    ZH: 'Zuid-Holland',
  },

  // United States (US)
  US: {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'District of Columbia',
  },

  // Japan (JP)
  JP: {
    '13': 'Tokyo',
    '27': 'Osaka',
    '26': 'Kyoto',
    '14': 'Kanagawa',
    '23': 'Aichi',
    '01': 'Hokkaido',
    '40': 'Fukuoka',
    '28': 'Hyogo',
  },

  // Canada (CA)
  CA: {
    AB: 'Alberta',
    BC: 'British Columbia',
    MB: 'Manitoba',
    NB: 'New Brunswick',
    NL: 'Newfoundland and Labrador',
    NS: 'Nova Scotia',
    NT: 'Northwest Territories',
    NU: 'Nunavut',
    ON: 'Ontario',
    PE: 'Prince Edward Island',
    QC: 'Quebec',
    SK: 'Saskatchewan',
    YT: 'Yukon',
  },

  // Australia (AU)
  AU: {
    ACT: 'Australian Capital Territory',
    NSW: 'New South Wales',
    NT: 'Northern Territory',
    QLD: 'Queensland',
    SA: 'South Australia',
    TAS: 'Tasmania',
    VIC: 'Victoria',
    WA: 'Western Australia',
  },
};

/**
 * Check whether a city name contradicts the assigned country.
 * Returns true if the city is a known major world city that does NOT belong to the given country.
 */
export function isCityCountryMismatch(country: string, city: string): boolean {
  if (!country || !city || country === 'Unknown' || city === 'Unknown') return false;

  const normalizedCountry = country.trim().toUpperCase();
  const normalizedCity = city.trim().toLowerCase();

  // 1. Direct dictionary match against major world cities
  const validCountries = MAJOR_CITY_COUNTRY_MAP[normalizedCity];
  if (validCountries) {
    return !validCountries.includes(normalizedCountry);
  }

  // 2. Partial / Compound name checks (e.g. "City of Amsterdam", "Amsterdam-Centrum")
  for (const [knownCity, allowedCountries] of Object.entries(MAJOR_CITY_COUNTRY_MAP)) {
    if (normalizedCity.includes(knownCity) && !allowedCountries.includes(normalizedCountry)) {
      return true;
    }
  }

  // 3. Known cross-continent anomalies
  if (normalizedCountry === 'CN' || normalizedCountry === 'ID' || normalizedCountry === 'JP' || normalizedCountry === 'KR') {
    if (/amsterdam|paris|london|frankfurt|berlin|rotterdam|madrid|rome/i.test(normalizedCity)) {
      return true;
    }
  }

  return false;
}

/**
 * Check whether a region code or name is an impossible mismatch for the given country.
 */
export function isInvalidRegionForCountry(country: string, region: string): boolean {
  if (!country || !region || country === 'Unknown' || region === 'Unknown') return false;

  const c = country.trim().toUpperCase();
  const r = region.trim().toUpperCase();

  // Edge anomaly: 'NH' (Noord-Holland) assigned to China
  if (c === 'CN' && (r === 'NH' || /noord-holland|netherlands/i.test(region))) {
    return true;
  }

  // Edge anomaly: 'IDF' (Île-de-France) assigned to Indonesia
  if (c === 'ID' && (r === 'IDF' || /ile-de-france|france|europe/i.test(region))) {
    return true;
  }

  return false;
}

/**
 * Translate 2-letter or abbreviated province/state codes into clear English region names.
 */
export function normalizeRegionName(country: string, rawRegion: string, rawRegionCode?: string): string {
  if (!country || country === 'Unknown') return rawRegion || 'Unknown';

  const c = country.trim().toUpperCase();
  const regCode = (rawRegionCode || '').trim().toUpperCase();
  const regName = (rawRegion || '').trim();

  // Discard cross-country anomalies
  if (isInvalidRegionForCountry(c, regCode) || isInvalidRegionForCountry(c, regName)) {
    return 'Unknown';
  }

  const countryMap = REGION_CODE_MAP[c];
  if (countryMap) {
    // 1. Try code mapping (e.g. 'HB' -> 'Hubei', 'BA' -> 'Bali', 'CA' -> 'California')
    if (regCode && countryMap[regCode]) {
      return countryMap[regCode];
    }
    const upperName = regName.toUpperCase();
    if (countryMap[upperName]) {
      return countryMap[upperName];
    }
  }

  // Clean trailing administrative suffixes (e.g. 'Hubei Sheng' -> 'Hubei', 'Bali Province' -> 'Bali')
  let cleaned = regName
    .replace(/\s+(Sheng|Province|Special Administrative Region|Administrative Region|Prefecture|Wilayah)$/i, '')
    .trim();

  // Clean Indonesian special designations
  if (c === 'ID') {
    cleaned = cleaned
      .replace(/^Daerah Khusus Ibukota\s+/i, '')
      .replace(/^Daerah Istimewa\s+/i, 'DI ')
      .trim();
  }

  return cleaned || 'Unknown';
}

/**
 * Sanitize geolocation payload to strictly eliminate impossible city-country pairings.
 */
export function sanitizeGeoRecord(geo: { city: string; country: string; region: string }): {
  city: string;
  country: string;
  region: string;
} {
  const country = (geo.country || 'Unknown').trim().toUpperCase();
  let city = (geo.city || 'Unknown').trim();
  let region = normalizeRegionName(country, geo.region);

  // If city is an impossible match for country, discard it
  if (isCityCountryMismatch(country, city)) {
    city = 'Unknown';
  }

  // If region is impossible for country, discard it
  if (isInvalidRegionForCountry(country, region)) {
    region = 'Unknown';
  }

  // If city is Unknown but region is valid, use region as city representation
  if ((city === 'Unknown' || city === '') && region !== 'Unknown' && region !== '') {
    city = region;
  }

  return { city, country, region };
}
