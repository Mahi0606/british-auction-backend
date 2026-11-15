import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum ExtensionTrigger {
  ANY_BID = 'ANY_BID',
  ANY_RANK_CHANGE = 'ANY_RANK_CHANGE',
  L1_CHANGE = 'L1_CHANGE',
}

export class CreateRfqDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  pickupLocation: string;

  @IsString()
  @IsNotEmpty()
  deliveryLocation: string;

  @IsDateString()
  serviceDate: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  originalCloseTime: string;

  @IsDateString()
  forcedCloseTime: string;

  @IsInt()
  @Min(1)
  triggerWindowMinutes: number;

  @IsInt()
  @Min(1)
  extensionDurationMinutes: number;

  @IsEnum(ExtensionTrigger)
  extensionTrigger: ExtensionTrigger;
}