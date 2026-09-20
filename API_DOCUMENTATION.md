# HookFlow API Documentation
Complete API reference for frontend integration with cURL examples, request/response formats, and error handling.

---

## Base URL
```
http://localhost:4000 (or your deployed backend URL)
```

## Authentication
All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```
Token expires in 10 hours.

---

## 1. Authentication Endpoints

### 1.1 Register User
**Endpoint:** `POST /auth/register`

**Description:** Register a new user with email, password, and phone number. Role is automatically set to CUSTOMER. Returns JWT token for auto-login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "phoneNumber": "+919876543210"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "phoneNumber": "+919876543210"
  }'
```

**Success Response (200):**
```json
{
  "message": "registraction successful",
  "user": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "user@example.com",
    "role": "CUSTOMER",
    "phoneNumber": "+919876543210"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Invalid phone number format (must be +91 followed by 10 digits)
- `500` - Registration failed (server error)

**Frontend Integration:**
- Validate phone number format before sending: `^\+91\d{10}$`
- Store user data and token in state/context after successful registration
- Auto-login user immediately (no need to redirect to login page)
- Configure Axios interceptor with the received token
- **Note:** Admin accounts are pre-created in the database. Registration always creates CUSTOMER accounts.

---

### 1.2 Login User
**Endpoint:** `POST /auth/login`

**Description:** Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

**Success Response (200):**
```json
{
  "message": "login successful",
  "getUser": {
    "email": "user@example.com",
    "role": "CUSTOMER",
    "phoneNumber": "+919876543210"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Unregistered user (email not found)
- `200` (with error message) - Incorrect password

**Frontend Integration:**
- Store token in localStorage or HttpOnly cookie
- Store user role (CUSTOMER/ADMIN) for route protection
- Configure Axios interceptor to attach token to all requests
- On 401 errors, clear token and redirect to login

---

## 2. Customer Billing Endpoints

### 2.1 Get My Subscription Status
**Endpoint:** `GET /api/myActivePlans`

**Description:** Fetch current subscription status for logged-in user. Returns ALL statuses (Active, Overdue, Pending, Cancelled).

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional, default: 1) - Page number for pagination
- `limit` (optional, default: 10) - Items per page

**cURL Example:**
```bash
curl -X GET "http://localhost:4000/api/myActivePlans?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200):**
```json
{
  "message": "fetch all subscriptions",
  "pagination": {
    "page": 1,
    "perPageLimit": 10,
    "totalNumberOfDocuments": 1
  },
  "subscriptions": [
    {
      "userid": "64f1a2b3c4d5e6f7a8b9c0d1",
      "razorpaySubscriptionId": "sub_N2d3k4l5m6n7o8",
      "paymentLink": "https://rzp.io/i/abc123xyz",
      "status": "Active",
      "amount": 499,
      "dueDate": "2026-10-18T00:00:00.000Z",
      "linkGeneratedAt": "2026-09-18T10:00:00.000Z",
      "createdAt": "2026-09-18T10:00:00.000Z",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  ]
}
```

**No Subscription Response (400):**
```json
{
  "message": "Subscrptions not found"
}
```

**Status Values & Frontend UI:**
- **Active** - Green badge: "Next billing date: [dueDate]"
- **Overdue** - Red banner: "Payment Failed. Please update your card." + "Update Card" button
- **Pending** - Yellow badge: "Payment pending. Complete checkout."
- **Cancelled** - Gray badge: "Plan cancelled. Access valid until [dueDate]"
- **No subscription** - Show "Subscribe Now" button

**Frontend Integration:**
- Call this endpoint on dashboard mount
- Use React Query for automatic loading/error states
- Display appropriate UI based on status field
- Format dueDate for user-friendly display

---

### 2.2 Generate Payment Link
**Endpoint:** `POST /api/billing/generate-link`

**Description:** Generate Razorpay subscription ID for SDK modal popup checkout or payment link for redirect flow (plus card update support for overdue accounts).

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**
```json
{
  "useSdk": true
}
```
- `useSdk` (boolean, optional, default: `true`):
  - `true`: Creates subscription with `customer_notify: false` for Razorpay SDK popup modal (`new window.Razorpay(options).open()`). Returns only `subscriptionId`.
  - `false`: Creates subscription with `customer_notify: true` for hosted page redirect flow. Returns `paymentLink` (`short_url`) and `subscriptionId`.

**cURL Examples:**

*SDK Flow (Default):*
```bash
curl -X POST http://localhost:4000/api/billing/generate-link \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"useSdk": true}'
```

*Redirect Flow:*
```bash
curl -X POST http://localhost:4000/api/billing/generate-link \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"useSdk": false}'
```

**Success Responses:**

**Case 1: New Subscription - SDK Flow (useSdk: true, default) (200):**
```json
{
  "success": true,
  "subscriptionId": "sub_N2d3k4l5m6n7o8"
}
```

**Case 2: New Subscription - Redirect Flow (useSdk: false) (200):**
```json
{
  "success": true,
  "paymentLink": "https://rzp.io/i/abc123xyz",
  "subscriptionId": "sub_N2d3k4l5m6n7o8"
}
```

**Case 3: Overdue - Card Update Required (200):**
```json
{
  "success": true,
  "requiresCardUpdate": true,
  "razorpaySubscriptionId": "sub_N2d3k4l5m6n7o8"
}
```

**Case 4: Fresh Pending Subscription (cached, < 24h) (200):**
- For SDK Flow: `{"success": true, "subscriptionId": "sub_N2d3k4l5m6n7o8"}`
- For Redirect Flow: `{"success": true, "paymentLink": "https://rzp.io/i/abc123xyz", "subscriptionId": "sub_N2d3k4l5m6n7o8"}`

**Error Responses:**
- `400` - Already have active subscription
- `400` - Subscription is paused (resume instead)
- `502` - Failed to generate subscription from Razorpay
- `500` - Server error

**Frontend Integration:**
- If `requiresCardUpdate: true` - Open Razorpay checkout with `subscription_card_change: 1`
- If SDK flow (`useSdk: true`) - Pass `subscription_id` to `new window.Razorpay(options).open()`
- If `paymentLink` exists (redirect flow) - Redirect browser to `paymentLink` or open in iframe
- Use Razorpay SDK: `https://checkout.razorpay.com/v1/checkout.js`
- On payment success, refresh subscription status
- Show success toast/modal after payment

**Razorpay Configuration:**
```javascript
const options = {
  key: 'YOUR_RAZORPAY_KEY',
  subscription_id: data.subscriptionId, // or razorpaySubscriptionId
  subscription_card_change: data.requiresCardUpdate ? 1 : 0,
  handler: function(response) {
    // Payment successful - refresh subscription status
    // Show success message
  }
};
const rzp = new Razorpay(options);
rzp.open();
```

---

### 2.3 Cancel Subscription
**Endpoint:** `POST /api/billing/cancel`

**Description:** Cancel user's subscription immediately (stops billing now, not end of cycle).

**Headers:**
```
Authorization: Bearer <token>
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/billing/cancel \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Subscription successfully cancelled with immediate effect.",
  "data": {
    "status": "Cancelled"
  }
}
```

**Error Responses:**
- `404` - No subscription found for this user
- `400` - Subscription is already cancelled
- `502` - Razorpay failed to cancel subscription
- `500` - Server error

**Frontend Integration:**
- Show confirmation modal before cancelling
- On success, update local state to "Cancelled"
- Show success message
- Refresh subscription status
- Disable "Cancel" button after cancellation

---

## 3. Admin Endpoints

### 3.1 Get Admin Stats
**Endpoint:** `GET /api/admin/stats`

**Description:** Fetch analytics data - total revenue, active users, failed payments.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `startDate` (optional) - Filter stats from this date (YYYY-MM-DD)
- `endDate` (optional) - Filter stats until this date (YYYY-MM-DD)

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/admin/stats?startDate=2026-01-01&endDate=2026-12-31" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 24950,
    "activeUsers": 45,
    "failedPayments": 3
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "message": "Failed to fetch admin stats"
}
```

**Frontend Integration:**
- Protect with AdminRoute (role: ADMIN)
- Display MRR (Monthly Recurring Revenue) = totalRevenue
- Show active users count
- Show overdue/failed payments count
- Use date range picker for filtering
- Format currency for revenue display

---

### 3.2 Get All Users
**Endpoint:** `GET /api/admin/users`

**Description:** Fetch paginated list of all users with subscription status and payment data.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Items per page

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/admin/users?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "email": "user@example.com",
        "phoneNumber": "+919876543210",
        "status": "Active",
        "dueDate": "2026-10-18T00:00:00.000Z",
        "amount": 499
      },
      {
        "userId": "64f1a2b3c4d5e6f7a8b9c0d2",
        "email": "user2@example.com",
        "phoneNumber": "+919876543211",
        "status": "Overdue",
        "dueDate": "2026-09-17T00:00:00.000Z",
        "amount": 499
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "message": "Failed to fetch users"
}
```

**Frontend Integration:**
- Protect with AdminRoute
- Use data table component (Shadcn UI or similar)
- Columns: Email, Phone, Status, Due Date, Amount
- Status badges with colors (Active=green, Overdue=red, etc.)
- Pagination controls
- Sortable columns
- Search/filter functionality

---

### 3.3 Simulate Payment Failure
**Endpoint:** `POST /api/admin/simulate-failure`

**Description:** Force a user's subscription into Overdue state for testing WhatsApp alerts and UI. This is a dev tool for testing.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/admin/simulate-failure \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Simulated failure successful. Queue triggered.",
  "data": {
    "newStatus": "Overdue",
    "newDueDate": "2026-09-17T11:30:00.000Z"
  }
}
```

**Error Responses:**
- `404` - No subscription found for userId
- `500` - Failed to simulate payment failure

**Frontend Integration:**
- Protect with AdminRoute
- Place in "Dev Tools" panel in admin dashboard
- Add warning: "This is for testing only"
- Input field for userId
- Button: "Simulate Payment Failure"
- On success, refresh user list to show new status
- Show success message: "User marked as Overdue, WhatsApp reminder queued"

---

## 4. Webhook Endpoint

### 4.1 Razorpay Webhook
**Endpoint:** `POST /webhooks/razorpay`

**Description:** Receives payment events from Razorpay (payment success, failure, subscription updates). This is server-to-server, not called by frontend.

**Headers:**
```
X-Razorpay-Signature: <webhook_secret_signature>
```

**Note:** Frontend does not call this endpoint. It's for Razorpay to notify your backend.

---

## Frontend Implementation Guide

### Authentication Flow
1. User registers → Store token + user role
2. Configure Axios interceptor:
```javascript
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### Route Protection
```javascript
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>

<AdminRoute>
  <AdminDashboard />
</AdminRoute>
```

### Dashboard Status Display
```javascript
const { data: subscription } = useQuery({
  queryKey: ['subscription'],
  queryFn: () => axios.get('/api/billing/my-plans')
});

if (!subscription) {
  return <SubscribeNowButton />;
}

switch (subscription.status) {
  case 'Active':
    return <GreenBadge>Next billing: {formatDate(subscription.dueDate)}</GreenBadge>;
  case 'Overdue':
    return (
      <RedBanner>
        Payment Failed. 
        <UpdateCardButton onClick={handleCardUpdate} />
      </RedBanner>
    );
  case 'Cancelled':
    return <GrayBadge>Cancelled until {formatDate(subscription.dueDate)}</GrayBadge>;
  default:
    return <YellowBadge>Pending payment</YellowBadge>;
}
```

### Razorpay Integration
```javascript
const handlePayNow = async () => {
  const { data } = await axios.post('/api/billing/generate-link');
  
  const options = {
    key: 'YOUR_RAZORPAY_KEY',
    subscription_id: data.requiresCardUpdate 
      ? data.razorpaySubscriptionId 
      : data.subscriptionId,
    subscription_card_change: data.requiresCardUpdate ? 1 : 0,
    handler: async (response) => {
      toast.success('Payment processing...');
      // Refresh subscription status
      await queryClient.invalidateQueries(['subscription']);
    }
  };
  
  const rzp = new Razorpay(options);
  rzp.open();
};
```

### Error Handling
- Always check `response.success` or `response.status`
- Show user-friendly error messages
- Use React Query's error state for loading/error states
- Log errors for debugging

### State Management (Zustand Example)
```javascript
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null })
}));
```

---

## Testing Checklist

### Authentication
- [ ] Register with valid phone number format
- [ ] Register with invalid phone number (should fail)
- [ ] Login with correct credentials
- [ ] Login with wrong password (should fail)
- [ ] Login with unregistered email (should fail)

### Customer Dashboard
- [ ] Load dashboard with Active subscription
- [ ] Load dashboard with Overdue subscription
- [ ] Load dashboard with Cancelled subscription
- [ ] Load dashboard with no subscription
- [ ] Generate payment link for new subscription
- [ ] Generate payment link for Overdue (card update)
- [ ] Cancel subscription
- [ ] Verify status updates after actions

### Admin Dashboard
- [ ] Access admin stats
- [ ] Filter stats by date range
- [ ] View user list with pagination
- [ ] Simulate payment failure
- [ ] Verify WhatsApp reminder triggered (check logs)

### Error Handling
- [ ] Test 401 unauthorized (auto-logout)
- [ ] Test 400 bad requests
- [ ] Test 500 server errors
- [ ] Test network failures

---

## Environment Variables Required
```
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_PREMIUM_PLAN_ID=your_plan_id
RAZOR_PAY_WEBHOOK_SECRET=your_webhook_secret
JWT_TOKEN=your_jwt_secret
REDIS_URL=redis://localhost:6379
INTERAKT_SECRET=your_interakt_secret
DASHBOARD_URL=http://localhost:5173
```

---

## Notes
- JWT token expires in 10 hours
- Phone numbers must be in E.164 format: +91 followed by 10 digits
- Subscription statuses: Active, Overdue, Pending, Cancelled, Paused
- Razorpay checkout SDK: https://checkout.razorpay.com/v1/checkout.js
- WhatsApp integration is currently mocked (not sending real messages)
- All monetary amounts are in INR
