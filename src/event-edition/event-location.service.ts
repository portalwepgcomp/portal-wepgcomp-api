import { Injectable, Logger } from '@nestjs/common';

export interface EventCoordinates {
  latitude: number;
  longitude: number;
  approximate: boolean;
  displayName: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  addresstype?: string;
}

export function getLocationText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function simplifyLocationQuery(address: string): string {
  const simplified = address
    .replace(/^\d+\s*,\s*(?=(?:R\.|Rua|Av\.|Avenida)\s+)/i, '')
    .replace(/\bR\.\s*/gi, 'Rua ')
    .replace(/\bAv\.\s*/gi, 'Avenida ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*\d{5}-?\d{3}\s*$/, '')
    .replace(/\bBA\b/g, 'Bahia')
    .trim();

  return /\bBrasil\b/i.test(simplified) ? simplified : `${simplified}, Brasil`;
}

@Injectable()
export class EventLocationService {
  private readonly logger = new Logger(EventLocationService.name);
  private nextRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  async locate(html: string): Promise<EventCoordinates | null> {
    const address = getLocationText(html);
    if (!address) return null;

    const queries = [...new Set([address, simplifyLocationQuery(address)])];
    const postalCode = address
      .match(/\b\d{5}-?\d{3}\b/)?.[0]
      .replace(/\D/g, '');

    for (const [index, query] of queries.entries()) {
      const results = await this.search(query);
      if (!results) return null;
      const match = postalCode
        ? results.find(
            (result) =>
              result.display_name
                .match(/\b\d{5}-?\d{3}\b/)?.[0]
                .replace(/\D/g, '') === postalCode,
          )
        : results[0];
      if (!match) continue;

      const latitude = Number(match.lat);
      const longitude = Number(match.lon);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        continue;
      }

      return {
        latitude,
        longitude,
        approximate:
          index > 0 ||
          match.category === 'highway' ||
          match.addresstype === 'road',
        displayName: match.display_name,
      };
    }

    return null;
  }

  private async search(query: string): Promise<NominatimResult[] | null> {
    const url = new URL(
      process.env.NOMINATIM_SEARCH_URL ??
        'https://nominatim.openstreetmap.org/search',
    );
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'br');

    return this.rateLimited(async () => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'PortalWEPGCOMP/1.0',
            'Accept-Language': 'pt-BR',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Geocoder unavailable');
        const results: unknown = await response.json();
        return Array.isArray(results) ? (results as NominatimResult[]) : [];
      } catch {
        this.logger.warn(
          'Geocodificação indisponível; endereço será salvo sem coordenadas.',
        );
        return null;
      }
    });
  }

  private rateLimited<T>(request: () => Promise<T>): Promise<T> {
    const queued = this.queue.then(async () => {
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      this.nextRequestAt = Date.now() + 1100;
      return request();
    });
    this.queue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}
