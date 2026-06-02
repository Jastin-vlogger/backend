export interface AccessRole {
  _id: string;
  key: string;
  name: string;
  description: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessPermission {
  _id: string;
  key: string;
  resource: string;
  screen: string;
  tab: string;
  field: string;
  action: string;
  type: 'screen' | 'tab' | 'field' | 'action';
  label: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  assigned?: boolean;
}

export interface AccessPermissionGroup {
  key: string;
  label: string;
  permissions: AccessPermission[];
}

export interface AccessUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EffectivePermissionsResponse {
  role: string;
  permissionKeys: string[];
  permissionGroups: AccessPermissionGroup[];
}

export interface BlRowDefinitionAdminItem {
  _id: string;
  key: string;
  sn: number;
  description: string;
  visibleTo: string[];
  defaultQty: number;
  defaultRate: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
