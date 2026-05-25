const REGION = process.env.NEXT_PUBLIC_AWS_REGION ?? 'eu-west-1';
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID;

const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

interface CognitoError {
  __type?: string;
  message?: string;
}

async function cognitoRequest<T>(target: string, body: Record<string, any>): Promise<T> {
  if (!CLIENT_ID) {
    throw new Error('Cognito Client ID is not configured in environment variables.');
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify({
      ClientId: CLIENT_ID,
      ...body,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errType = data.__type ? data.__type.split('#')[1] : 'UnknownException';
    const errMsg = data.message ?? 'An error occurred during Cognito operation.';
    const error = new Error(errMsg);
    (error as any).code = errType;
    throw error;
  }

  return data as T;
}

export interface SignInResult {
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
  ExpiresIn: number;
}

export const cognito = {
  signUp: (email: string, password: string): Promise<{ UserSub: string; UserConfirmed: boolean }> =>
    cognitoRequest('SignUp', {
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    }),

  confirmSignUp: (email: string, code: string): Promise<void> =>
    cognitoRequest('ConfirmSignUp', {
      Username: email,
      ConfirmationCode: code,
    }),

  signIn: async (email: string, password: string): Promise<SignInResult> => {
    const data = await cognitoRequest<{ AuthenticationResult?: SignInResult }>('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    if (!data.AuthenticationResult) {
      throw new Error('Authentication succeeded but returned no credentials.');
    }

    return data.AuthenticationResult;
  },
};
