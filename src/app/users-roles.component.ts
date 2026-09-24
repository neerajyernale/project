import { Component } from '@angular/core';
import { USERS, ROLES, PERMISSION_MODULES, PERMISSION_MATRIX, statusClass } from './data';

@Component({
  selector: 'app-users-roles',
  templateUrl: './users-roles.component.html',
})
export class UsersRoles {
  users = USERS;
  roles = ROLES;
  permissionModules = PERMISSION_MODULES;
  permissionMatrix = PERMISSION_MATRIX;
  view: 'users' | 'roles' = 'users';
  selectedRole = 'Admin';

  activeCount(): number {
    return this.users.filter(u => u.status === 'ACTIVE').length;
  }

  userCountForRole(role: string): number {
    return this.users.filter(u => u.role === role).length;
  }

  statusClass = statusClass;
}
