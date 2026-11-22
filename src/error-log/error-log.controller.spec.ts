import { JwtService } from '@nestjs/jwt';
import { EMPTY } from 'rxjs';
import { ErrorLogController } from './error-log.controller';
import { ErrorLogQueryService } from './error-log-query.service';
import { ErrorLogStreamService } from './error-log-stream.service';

describe('ErrorLogController.stream', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  let stream: { connect: jest.Mock };
  let controller: ErrorLogController;

  beforeEach(() => {
    stream = { connect: jest.fn().mockReturnValue(EMPTY) };
    controller = new ErrorLogController(
      {} as ErrorLogQueryService,
      stream as unknown as ErrorLogStreamService,
      jwtService,
    );
  });

  it('encerra o stream no exp do token', () => {
    const token = jwtService.sign({ userId: 'u1' }, { expiresIn: '6h' });
    const { exp } = jwtService.decode<{ exp: number }>(token);

    controller.stream(`Bearer ${token}`);

    expect(stream.connect).toHaveBeenCalledWith(new Date(exp * 1000));
  });

  it('não define expiração sem token Bearer', () => {
    controller.stream(undefined);
    controller.stream('Basic abc');

    expect(stream.connect).toHaveBeenNthCalledWith(1, undefined);
    expect(stream.connect).toHaveBeenNthCalledWith(2, undefined);
  });
});
