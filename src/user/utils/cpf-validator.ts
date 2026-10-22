import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/** Valida CPF sem pontuação, incluindo sequência e dígitos verificadores. */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base: string, initialWeight: number): number => {
    const sum = [...base].reduce(
      (total, digit, index) => total + Number(digit) * (initialWeight - index),
      0,
    );
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    calculateDigit(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
}

export function IsCpf(
  validationOptions?: ValidationOptions,
  shouldValidate: (object: Record<string, unknown>) => boolean = () => true,
) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isCpf',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown, args?: ValidationArguments): boolean => {
          if (
            !shouldValidate((args?.object ?? {}) as Record<string, unknown>)
          ) {
            return true;
          }
          return typeof value === 'string' && isValidCpf(value);
        },
        defaultMessage: (): string => 'CPF inválido.',
      },
    });
  };
}
