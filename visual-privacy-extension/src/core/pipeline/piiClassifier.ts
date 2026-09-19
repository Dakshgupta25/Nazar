import { OcrResult, PiiClassificationResult, PiiFinding, PiiType, PipelineStage } from '../types/pipeline';
import { GeometryUtils } from '../geometry/geometryUtils';

/**
 * Verhoeff checksum algorithm implementation for Aadhaar validation.
 */
class Verhoeff {
  private static d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];

  private static p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];

  public static validate(numStr: string): boolean {
    const clean = numStr.replace(/\D/g, '');
    if (clean.length !== 12) return false;

    let c = 0;
    const myArray = clean.split('').map(Number).reverse();

    for (let i = 0; i < myArray.length; i++) {
      c = Verhoeff.d[c][Verhoeff.p[i % 8][myArray[i]]];
    }

    return c === 0;
  }
}

/**
 * Luhn checksum algorithm for Credit Card number validation.
 */
class Luhn {
  public static validate(cardNumber: string): boolean {
    const clean = cardNumber.replace(/\D/g, '');
    if (clean.length < 13 || clean.length > 19) return false;

    let sum = 0;
    let shouldDouble = false;

    for (let i = clean.length - 1; i >= 0; i--) {
      let digit = parseInt(clean.charAt(i), 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }
}

export function maskText(text: string, type: PiiType): string {
  const clean = text.trim();

  switch (type) {
    case 'EMAIL': {
      const parts = clean.split('@');
      if (parts.length === 2) {
        const name = parts[0];
        const maskedName = name.length <= 2 ? name.charAt(0) + '***' : name.charAt(0) + '***' + name.charAt(name.length - 1);
        return `${maskedName}@${parts[1]}`;
      }
      return 'e***@***.com';
    }
    case 'PHONE': {
      const digits = clean.replace(/\D/g, '');
      const localDigits = digits.length > 10 && digits.startsWith('91') ? digits.substring(2) : digits;
      if (localDigits.length >= 10) {
        return localDigits.substring(0, 2) + '******' + localDigits.substring(localDigits.length - 2);
      }
      return '98******10';
    }
    case 'PAN': {
      if (clean.length === 10) {
        return clean.substring(0, 2) + '***' + clean.substring(5);
      }
      return 'AB***1234F';
    }
    case 'AADHAAR': {
      const digits = clean.replace(/\D/g, '');
      if (digits.length === 12) {
        return `${digits.substring(0, 4)} **** ${digits.substring(8)}`;
      }
      return '1234 **** 9012';
    }
    case 'CREDIT_CARD': {
      const digits = clean.replace(/\D/g, '');
      if (digits.length >= 13) {
        return `${digits.substring(0, 4)} **** **** ${digits.substring(digits.length - 4)}`;
      }
      return '4111 **** **** 1111';
    }
    case 'BANK_ACCOUNT': {
      if (clean.length > 8) {
        return clean.substring(0, 4) + '****' + clean.substring(clean.length - 4);
      }
      return 'BANK****1234';
    }
    case 'URL': {
      try {
        const fullUrl = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
        const urlObj = new URL(fullUrl);
        return `${urlObj.hostname}/***`;
      } catch {
        return clean.substring(0, 10) + '***';
      }
    }
    default:
      return '*****';
  }
}

export class PiiClassifier implements PipelineStage<OcrResult[], PiiClassificationResult> {
  readonly name = 'PiiClassifier';

  public async process(input: OcrResult[]): Promise<PiiClassificationResult> {
    return this.classify(input);
  }

  /**
   * Deterministically classifies OCR text findings into PII risk categories.
   */
  public classify(ocrResults: OcrResult[]): PiiClassificationResult {
    const startTime = performance.now();
    const piiFindings: PiiFinding[] = [];
    const matchedOcrIds = new Set<string>();

    // 1. First Pass: Standalone Pattern Detectors (Email, Credit Card, Aadhaar, PAN, Phone, Bank, URL)
    for (const ocrItem of ocrResults) {
      const text = (ocrItem.text || '').trim();
      if (!text) continue;

      const piiMatch = this.detectPii(text, ocrItem);
      if (piiMatch) {
        piiFindings.push(piiMatch);
        matchedOcrIds.add(ocrItem.id);
      }
    }

    // 2. Second Pass: Contextual Document Field Classification (ID numbers, DOB, guardian/relative labels)
    const contextualFindings = this.detectContextualPii(ocrResults, matchedOcrIds);
    for (const cFinding of contextualFindings) {
      piiFindings.push(cFinding);
      matchedOcrIds.add(cFinding.ocrId);
    }

    // 3. Separate non-sensitive OCR results
    const nonSensitiveResults = ocrResults.filter((o) => !matchedOcrIds.has(o.id));

    const durationMs = Math.round(performance.now() - startTime);

    return {
      piiFindings,
      nonSensitiveResults,
      classificationTimeMs: durationMs
    };
  }

  /**
   * Scans OCR results for contextual document labels (e.g. ID, Batch, Reg No, DOB, C/O, Address) and classifies associated fields.
   */
  private detectContextualPii(rawOcrResults: OcrResult[], matchedOcrIds: Set<string>): PiiFinding[] {
    const findings: PiiFinding[] = [];

    // Spatially sort OCR tokens by vertical Y position, then horizontal X position
    const ocrResults = [...rawOcrResults].sort((a, b) => {
      const dy = a.box.y - b.box.y;
      if (Math.abs(dy) <= 12) return a.box.x - b.box.x;
      return dy;
    });

    const phoneLabelRegex = /\b(?:mob\.?\s*no\.?|mobile\.?\s*no\.?|phone\.?\s*no\.?|contact\.?\s*no\.?|tel\.?\s*no\.?|contact|mobile|phone|call)\b/i;
    const idLabelRegex = /\b(?:batch|reg\.?\s*no|reg\s*no|registration|roll\s*no|student\s*id|univ\s*id|employee\s*id|emp\s*id|id\s*no|id\s*number|id:|card\s*no|identity|license|dl\s*no|ssn|passport)\b/i;
    const dateLabelRegex = /\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date|born|valid\s*upto|valid\s*to|exp\s*date|expiry\s*date|issue\s*date)\b/i;
    const relativeLabelRegex = /\b(?:c\/o|g\/o|s\/o|d\/o|w\/o|father|mother|spouse|guardian)\b/i;
    const aadhaarContextRegex = /\b(?:aadhaar|uid|unique\s*id|govt\s*id|identity)\b/i;
    const addressLabelRegex = /\b(?:address|permanent\s*address|present\s*address|residential\s*address|residence|res\.?|add\.?|h\.?no\.?|house\s*no\.?|village|vill\.?|street|road|ward|district|dist\.?|city|state|pin|pin\s*code|pincode|postal\s*address|flat\s*no)\b/i;

    const pinCodeRegex = /\b[1-9]\d{5}\b/;
    const addressLandmarkRegex = /\b(?:park|line|naka|nagar|colony|marg|chowk|cross|phase|sector|block|complex|society|building|apt|apartment|estate|industrial|opp|behind|near)\b/i;

    const dateValueRegex = /\b(?:\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})\b/;
    const idCodeRegex = /\b[A-Za-z0-9\-]{3,20}\b/;

    // 1. Contextual Phone Number Label + Digit Grouping
    for (let i = 0; i < ocrResults.length; i++) {
      const item = ocrResults[i];
      if (matchedOcrIds.has(item.id)) continue;
      const text = (item.text || '').trim();

      if (phoneLabelRegex.test(text)) {
        // Look for digit/phone tokens nearby
        const phoneItems: OcrResult[] = [item];
        matchedOcrIds.add(item.id);

        for (let j = i + 1; j < ocrResults.length; j++) {
          const nextItem = ocrResults[j];
          if (matchedOcrIds.has(nextItem.id)) continue;
          const nextText = (nextItem.text || '').trim();
          if (!nextText) continue;

          const dy = Math.abs(nextItem.box.y - item.box.y);
          const dx = Math.abs(nextItem.box.x - item.box.x);

          if (dy <= 25 && dx <= 300) {
            const cleanDigits = nextText.replace(/\D/g, '');
            const localDigits = cleanDigits.length > 10 && cleanDigits.startsWith('91')
              ? cleanDigits.substring(2)
              : (cleanDigits.length === 11 && cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits);

            if (localDigits.length === 10 && /^[6-9]/.test(localDigits) && !/^(\d)\1{9}$/.test(localDigits) && localDigits !== '1234567890') {
              phoneItems.push(nextItem);
              matchedOcrIds.add(nextItem.id);
            }
          }
        }

        if (phoneItems.length >= 2) {
          let unionBox = { ...phoneItems[0].box };
          for (let k = 1; k < phoneItems.length; k++) {
            unionBox = GeometryUtils.union(unionBox, phoneItems[k].box);
          }
          const fullPhoneText = phoneItems.map((p) => p.text).join(' ');

          findings.push({
            id: `pii-phone-context-${Math.random().toString(36).substring(2, 7)}`,
            piiType: 'PHONE',
            ocrId: item.id,
            ocrConfidence: item.confidence,
            confidence: 0.96,
            originalText: fullPhoneText,
            maskedText: maskText(fullPhoneText, 'PHONE'),
            box: unionBox,
            reason: 'Contextual phone number matched near contact label'
          });
        } else {
          matchedOcrIds.delete(item.id);
        }
      }
    }

    // 2. Multi-Line Address Block Detection & Grouping
    for (let i = 0; i < ocrResults.length; i++) {
      const item = ocrResults[i];
      if (matchedOcrIds.has(item.id)) continue;
      const text = (item.text || '').trim();

      const isAddressStart = addressLabelRegex.test(text) || (text.length >= 6 && (pinCodeRegex.test(text) || addressLandmarkRegex.test(text)));
      if (!isAddressStart) continue;

      const addressItems: OcrResult[] = [item];
      matchedOcrIds.add(item.id);

      for (let j = i + 1; j < ocrResults.length; j++) {
        const nextItem = ocrResults[j];
        if (matchedOcrIds.has(nextItem.id)) continue;
        const nextText = (nextItem.text || '').trim();
        if (!nextText) continue;

        if (/\b(?:dob|d\.o\.b|date|batch|reg\.?\s*no|signature|sign|valid\s*upto|blood\s*group|mob|mobile|phone|contact)\b/i.test(nextText)) {
          break;
        }

        const lastBox = addressItems[addressItems.length - 1].box;
        const dy = nextItem.box.y - (lastBox.y + lastBox.height);
        const dx = Math.abs(nextItem.box.x - lastBox.x);

        if (dy >= -15 && dy <= 45 && dx <= 350) {
          addressItems.push(nextItem);
          matchedOcrIds.add(nextItem.id);
        } else if (dy > 45) {
          break;
        }
      }

      let unionBox = { ...addressItems[0].box };
      for (let k = 1; k < addressItems.length; k++) {
        unionBox = GeometryUtils.union(unionBox, addressItems[k].box);
      }

      const fullAddressText = addressItems.map((a) => a.text).join(' ');

      findings.push({
        id: `pii-address-${Math.random().toString(36).substring(2, 7)}`,
        piiType: 'ADDRESS',
        ocrId: item.id,
        ocrConfidence: item.confidence,
        confidence: 0.95,
        originalText: fullAddressText,
        maskedText: maskText(fullAddressText, 'ADDRESS'),
        box: unionBox,
        reason: 'Multi-line address block matched via label and spatial line grouping'
      });
    }

    // 2. Contextual ID, DOB, Guardian & Aadhaar Scans
    for (let i = 0; i < ocrResults.length; i++) {
      const item = ocrResults[i];
      if (matchedOcrIds.has(item.id)) continue;
      const text = (item.text || '').trim();

      if (idLabelRegex.test(text)) {
        const valuePart = text.replace(idLabelRegex, '').replace(/[:\s]/g, '');
        if (valuePart.length >= 3) {
          findings.push({
            id: `pii-context-id-${Math.random().toString(36).substring(2, 7)}`,
            piiType: 'OTHER_SENSITIVE',
            ocrId: item.id,
            ocrConfidence: item.confidence,
            confidence: 0.95,
            originalText: text,
            maskedText: maskText(text, 'OTHER_SENSITIVE'),
            box: { ...item.box },
            reason: 'Contextual sensitive ID number matched near label'
          });
          matchedOcrIds.add(item.id);
          continue;
        }
      }

      if (dateLabelRegex.test(text)) {
        const dateMatch = text.match(dateValueRegex);
        if (dateMatch) {
          findings.push({
            id: `pii-context-dob-${Math.random().toString(36).substring(2, 7)}`,
            piiType: 'OTHER_SENSITIVE',
            ocrId: item.id,
            ocrConfidence: item.confidence,
            confidence: 0.95,
            originalText: text,
            maskedText: maskText(text, 'OTHER_SENSITIVE'),
            box: { ...item.box },
            reason: 'Contextual date matched near DOB/validity label'
          });
          matchedOcrIds.add(item.id);
          continue;
        }
      }

      if (aadhaarContextRegex.test(text) || ocrResults.some((o) => aadhaarContextRegex.test(o.text))) {
        const digits12Match = text.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
        if (digits12Match && !matchedOcrIds.has(item.id)) {
          findings.push({
            id: `pii-aadhaar-context-${Math.random().toString(36).substring(2, 7)}`,
            piiType: 'AADHAAR',
            ocrId: item.id,
            ocrConfidence: item.confidence,
            confidence: 0.92,
            originalText: digits12Match[0],
            maskedText: maskText(digits12Match[0], 'AADHAAR'),
            box: { ...item.box },
            reason: '12-digit identifier matched in explicit Aadhaar/Identity document context'
          });
          matchedOcrIds.add(item.id);
          continue;
        }
      }

      const isIdLabel = idLabelRegex.test(text);
      const isDateLabel = dateLabelRegex.test(text);
      const isRelativeLabel = relativeLabelRegex.test(text);

      if (isIdLabel || isDateLabel || isRelativeLabel) {
        for (let j = 0; j < ocrResults.length; j++) {
          if (i === j) continue;
          const nextItem = ocrResults[j];
          if (matchedOcrIds.has(nextItem.id)) continue;
          const nextText = (nextItem.text || '').trim();
          if (!nextText) continue;

          const dx = Math.abs(nextItem.box.x - item.box.x);
          const dy = Math.abs(nextItem.box.y - item.box.y);

          if (dy < 40 && dx < 300) {
            let matchedType: PiiType | null = null;
            let matchedReason = '';

            if (isIdLabel && idCodeRegex.test(nextText) && nextText.length >= 3 && !/^(the|and|for|with|from|this|that|batch)$/i.test(nextText)) {
              matchedType = 'OTHER_SENSITIVE';
              matchedReason = `Contextual sensitive ID value '${nextText}' matched near label '${text}'`;
            } else if (isDateLabel && (dateValueRegex.test(nextText) || /^\d{4}$/.test(nextText))) {
              matchedType = 'OTHER_SENSITIVE';
              matchedReason = `Contextual DOB/Date value '${nextText}' matched near label '${text}'`;
            } else if (isRelativeLabel && nextText.length >= 2 && !/^(the|and|for|with|from)$/i.test(nextText)) {
              matchedType = 'OTHER_SENSITIVE';
              matchedReason = `Contextual guardian/relative name '${nextText}' matched near label '${text}'`;
            }

            if (matchedType) {
              findings.push({
                id: `pii-context-${Math.random().toString(36).substring(2, 7)}`,
                piiType: matchedType,
                ocrId: nextItem.id,
                ocrConfidence: nextItem.confidence,
                confidence: 0.95,
                originalText: nextText,
                maskedText: maskText(nextText, matchedType),
                box: { ...nextItem.box },
                reason: matchedReason
              });
              matchedOcrIds.add(nextItem.id);
            }
          }
        }
      }
    }

    return findings;
  }

  /**
   * Runs category rules against a single OCR text string.
   */
  private detectPii(text: string, ocrItem: OcrResult): PiiFinding | null {
    // 1. Email check
    const emailRes = this.validateEmail(text);
    if (emailRes) return this.createFinding('EMAIL', emailRes.confidence, emailRes.reason, emailRes.matchedText, ocrItem);

    // 2. Credit Card check (Luhn algorithm)
    const cardRes = this.validateCreditCard(text);
    if (cardRes) return this.createFinding('CREDIT_CARD', cardRes.confidence, cardRes.reason, cardRes.matchedText, ocrItem);

    // 3. Aadhaar check (Verhoeff algorithm / 12-digit pattern)
    const aadhaarRes = this.validateAadhaar(text);
    if (aadhaarRes) return this.createFinding('AADHAAR', aadhaarRes.confidence, aadhaarRes.reason, aadhaarRes.matchedText, ocrItem);

    // 4. PAN check (India PAN 10-char format)
    const panRes = this.validatePan(text);
    if (panRes) return this.createFinding('PAN', panRes.confidence, panRes.reason, panRes.matchedText, ocrItem);

    // 5. Phone check
    const phoneRes = this.validatePhone(text);
    if (phoneRes) return this.createFinding('PHONE', phoneRes.confidence, phoneRes.reason, phoneRes.matchedText, ocrItem);

    // 6. Bank Account / IFSC check
    const bankRes = this.validateBankAccount(text);
    if (bankRes) return this.createFinding('BANK_ACCOUNT', bankRes.confidence, bankRes.reason, bankRes.matchedText, ocrItem);

    // 7. URL check
    const urlRes = this.validateUrl(text);
    if (urlRes) return this.createFinding('URL', urlRes.confidence, urlRes.reason, urlRes.matchedText, ocrItem);

    return null; // Non-sensitive text
  }

  private createFinding(
    piiType: PiiType,
    confidence: number,
    reason: string,
    originalText: string,
    ocrItem: OcrResult
  ): PiiFinding {
    return {
      id: `pii-${piiType.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`,
      piiType,
      ocrId: ocrItem.id,
      ocrConfidence: ocrItem.confidence,
      confidence,
      originalText,
      maskedText: maskText(originalText, piiType),
      box: { ...ocrItem.box },
      reason
    };
  }

  // --- Category Validation Helpers ---

  public validateEmail(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      return { matchedText: emailMatch[0], confidence: 0.99, reason: 'Valid RFC email pattern matched' };
    }
    return null;
  }

  public validateCreditCard(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const cardMatch = text.match(/\b(?:\d[ -]*?){13,19}\b/);
    if (cardMatch) {
      const clean = cardMatch[0].replace(/[\s-]/g, '');
      if (clean.length >= 13 && clean.length <= 19 && Luhn.validate(clean)) {
        return { matchedText: cardMatch[0], confidence: 0.98, reason: 'Luhn checksum validated credit card number' };
      }
    }
    return null;
  }

  public validateAadhaar(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const aadhaarMatch = text.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
    if (aadhaarMatch) {
      const clean = aadhaarMatch[0].replace(/[\s-]/g, '');
      if (clean.length === 12 && !/^(\d)\1{11}$/.test(clean)) {
        const isValidChecksum = Verhoeff.validate(clean);
        return {
          matchedText: aadhaarMatch[0],
          confidence: isValidChecksum ? 0.98 : 0.95,
          reason: isValidChecksum
            ? 'Verhoeff checksum validated 12-digit Aadhaar pattern'
            : '12-digit Indian Aadhaar number pattern matched'
        };
      }
    }
    return null;
  }

  public validatePan(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const panMatch = text.match(/\b[A-Z]{5}\d{4}[A-Z]{1}\b/i);
    if (panMatch) {
      const clean = panMatch[0].toUpperCase();
      const entityTypes: Record<string, string> = {
        P: 'Individual',
        C: 'Company',
        H: 'HUF',
        F: 'Firm',
        A: 'AOP',
        T: 'Trust',
        B: 'BOI',
        L: 'Local Authority',
        J: 'Artificial Juridical Person',
        G: 'Government'
      };
      const entityChar = clean.charAt(3);

      if (entityTypes[entityChar]) {
        return {
          matchedText: clean,
          confidence: 0.98,
          reason: `PAN structure and entity character ('${entityChar}' - ${entityTypes[entityChar]}) matched`
        };
      }
    }
    return null;
  }

  public validatePhone(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const phonePattern = /(?:\+?91[\s.-]?|0)?(?:\(0\))?\s*[6-9]\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{3,4}\b/;
    const phoneMatch = text.match(phonePattern);
    if (phoneMatch) {
      const cleanDigits = phoneMatch[0].replace(/\D/g, '');
      const localDigits = cleanDigits.length > 10 && cleanDigits.startsWith('91')
        ? cleanDigits.substring(2)
        : (cleanDigits.length === 11 && cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits);

      if (localDigits.length === 10 && /^[6-9]/.test(localDigits) && !/^(\d)\1{9}$/.test(localDigits) && localDigits !== '1234567890') {
        return { matchedText: phoneMatch[0], confidence: 0.96, reason: 'Indian mobile/landline number pattern matched' };
      }
    }
    return null;
  }

  public validateBankAccount(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const ifscMatch = text.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i);
    if (ifscMatch) {
      return { matchedText: ifscMatch[0].toUpperCase(), confidence: 0.96, reason: 'Indian Financial System Code (IFSC) pattern matched' };
    }

    const acctMatch = text.match(/(?:A\/C|Account|Acc|A\/c\s*No\.?)\s*:?\s*(\d{9,18})/i);
    if (acctMatch) {
      return { matchedText: acctMatch[0], confidence: 0.95, reason: 'Bank account number with prefix indicator matched' };
    }

    return null;
  }

  public validateUrl(text: string): { matchedText: string; confidence: number; reason: string } | null {
    const urlMatch = text.match(/(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?|\b[a-zA-Z0-9.-]+\.(?:com|org|net|edu|gov|io|co|in|info|biz)\b(?:\/[^\s]*)?/i);
    if (urlMatch) {
      const clean = urlMatch[0];
      if (clean.includes('.') && !clean.includes('@')) {
        return { matchedText: clean, confidence: 0.97, reason: 'Web URL domain pattern matched' };
      }
    }
    return null;
  }

  public maskText(text: string, type: PiiType): string {
    return maskText(text, type);
  }
}

