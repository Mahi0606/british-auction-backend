import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum RegisterRole {
  BUYER = 'BUYER',
  SUPPLIER = 'SUPPLIER',
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsEnum(RegisterRole)
  role?: RegisterRole;

  @ValidateIf((o) => o.role === RegisterRole.SUPPLIER)
  @IsString()
  @IsNotEmpty()
  companyName?: string;
}