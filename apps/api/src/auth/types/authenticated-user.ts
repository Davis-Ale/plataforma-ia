export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  companies: Array<{
    id: string;
    role: string;
    status: string;
    company: {
      id: string;
      name: string;
      status: string;
    };
  }>;
};
