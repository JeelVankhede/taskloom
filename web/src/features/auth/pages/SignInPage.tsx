import { SignInForm } from '../components/SignInForm';
import { AuthPage } from './AuthPage';

export function SignInPage() {
  return (
    <AuthPage
      title="Sign in"
      switchPrompt="New to Taskloom?"
      switchLabel="Create an account"
      switchTo="/signup"
    >
      <SignInForm />
    </AuthPage>
  );
}
