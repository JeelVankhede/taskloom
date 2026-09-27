import { SignUpForm } from '../components/SignUpForm';
import { AuthPage } from './AuthPage';

export function SignUpPage() {
  return (
    <AuthPage
      title="Create your account"
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchTo="/signin"
    >
      <SignUpForm />
    </AuthPage>
  );
}
