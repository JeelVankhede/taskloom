import { IsString, MaxLength } from 'class-validator';

// Shape only. The rules (length, format, password not equal to email) come from
// @taskloom/contracts checkSignUp, so the API and the web forms apply the same ones.

export class SignUpDto {
  @IsString() @MaxLength(254) email!: string;
  @IsString() @MaxLength(256) password!: string;
  @IsString() @MaxLength(256) displayName!: string;
}

export class SignInDto {
  @IsString() @MaxLength(254) email!: string;
  @IsString() @MaxLength(256) password!: string;
}
