import {
  EventLocationService,
  getLocationText,
  simplifyLocationQuery,
} from './event-location.service';

describe('EventLocationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('remove HTML e normaliza o endereço para a segunda busca', () => {
    const address = getLocationText(
      '<p>1154, R. Barão de Jeremoabo, 668 - Ondina, Salvador - BA, 40170-115</p>',
    );
    expect(address).toBe(
      '1154, R. Barão de Jeremoabo, 668 - Ondina, Salvador - BA, 40170-115',
    );
    expect(simplifyLocationQuery(address)).toBe(
      'Rua Barão de Jeremoabo, 668, Ondina, Salvador, Bahia, Brasil',
    );
  });

  it('salva o resultado de uma busca simplificada como ponto aproximado', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              lat: '-13.0058396',
              lon: '-38.5113662',
              display_name:
                'Rua Barão de Jeremoabo, Salvador, 40210-909, Brasil',
              category: 'highway',
              addresstype: 'road',
            },
            {
              lat: '-13.0020509',
              lon: '-38.5103112',
              display_name:
                'Rua Barão de Jeremoabo, Salvador, 40170-115, Brasil',
              category: 'highway',
              addresstype: 'road',
            },
          ]),
          { status: 200 },
        ),
      );

    const service = new EventLocationService();
    const coordinates = await service.locate(
      '<p>1154, R. Barão de Jeremoabo, 668 - Ondina, Salvador - BA, 40170-115</p>',
    );

    expect(coordinates).toEqual({
      latitude: -13.0020509,
      longitude: -38.5103112,
      approximate: true,
      displayName: 'Rua Barão de Jeremoabo, Salvador, 40170-115, Brasil',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as URL;
    expect(secondUrl.searchParams.get('q')).toBe(
      'Rua Barão de Jeremoabo, 668, Ondina, Salvador, Bahia, Brasil',
    );
  });

  it('não consulta o serviço quando o endereço está vazio', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new EventLocationService();

    expect(await service.locate('<p> </p>')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
