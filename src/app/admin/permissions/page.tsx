"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
    Shield,
    Users,
    UserPlus,
    UserMinus,
    Search,
    Save,
    RefreshCw,
    Info,
    CheckCircle,
    XCircle,
    Settings,
    ChevronRight,
    User as UserIcon,
    Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffUser {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

interface Permission {
    _id: string;
    key: string;
    name: string;
    description: string;
    category: string;
    allowedRoles: string[];
    allowedUsers: StaffUser[];
    deniedUsers: StaffUser[];
    isActive: boolean;
}

interface PermissionUpdate {
    permissionId: string;
    allowedRoles?: string[];
    allowedUsers?: string[];
    deniedUsers?: string[];
}

export default function PermissionsPage() {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("all");

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
    const [editForm, setEditForm] = useState<{
        allowedRoles: string[];
        allowedUsers: string[];
        deniedUsers: string[];
    }>({
        allowedRoles: [],
        allowedUsers: [],
        deniedUsers: [],
    });

    // Track unsaved changes
    const [pendingChanges, setPendingChanges] = useState<Map<string, PermissionUpdate>>(new Map());

    const fetchPermissions = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/permissions');
            const data = await response.json();

            if (data.success) {
                setPermissions(data.permissions);
                setStaffUsers(data.staffUsers);
                setCategories(data.categories);
            } else {
                toast.error('Failed to fetch permissions');
            }
        } catch (error) {
            console.error('Error fetching permissions:', error);
            toast.error('Failed to fetch permissions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    const openEditDialog = (permission: Permission) => {
        setSelectedPermission(permission);
        setEditForm({
            allowedRoles: permission.allowedRoles,
            allowedUsers: permission.allowedUsers.map(u => u._id),
            deniedUsers: permission.deniedUsers.map(u => u._id),
        });
        setEditDialogOpen(true);
    };

    const handleRoleToggle = (role: string) => {
        setEditForm(prev => ({
            ...prev,
            allowedRoles: prev.allowedRoles.includes(role)
                ? prev.allowedRoles.filter(r => r !== role)
                : [...prev.allowedRoles, role],
        }));
    };

    const handleUserToggle = (userId: string, type: 'allowed' | 'denied') => {
        if (type === 'allowed') {
            setEditForm(prev => {
                const isAllowed = prev.allowedUsers.includes(userId);
                return {
                    ...prev,
                    allowedUsers: isAllowed
                        ? prev.allowedUsers.filter(id => id !== userId)
                        : [...prev.allowedUsers, userId],
                    // Remove from denied if adding to allowed
                    deniedUsers: isAllowed ? prev.deniedUsers : prev.deniedUsers.filter(id => id !== userId),
                };
            });
        } else {
            setEditForm(prev => {
                const isDenied = prev.deniedUsers.includes(userId);
                return {
                    ...prev,
                    deniedUsers: isDenied
                        ? prev.deniedUsers.filter(id => id !== userId)
                        : [...prev.deniedUsers, userId],
                    // Remove from allowed if adding to denied
                    allowedUsers: isDenied ? prev.allowedUsers : prev.allowedUsers.filter(id => id !== userId),
                };
            });
        }
    };

    const savePermission = async () => {
        if (!selectedPermission) return;

        try {
            setSaving(true);
            const response = await fetch('/api/admin/permissions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissionId: selectedPermission._id,
                    allowedRoles: editForm.allowedRoles,
                    allowedUsers: editForm.allowedUsers,
                    deniedUsers: editForm.deniedUsers,
                }),
            });

            const data = await response.json();
            if (data.success) {
                toast.success('Permission updated successfully');
                setEditDialogOpen(false);
                fetchPermissions();
            } else {
                toast.error(data.error || 'Failed to update permission');
            }
        } catch (error) {
            console.error('Error saving permission:', error);
            toast.error('Failed to save permission');
        } finally {
            setSaving(false);
        }
    };

    // Quick toggle for role-based permission (without opening dialog)
    const quickToggleRole = async (permission: Permission, role: string) => {
        const newRoles = permission.allowedRoles.includes(role)
            ? permission.allowedRoles.filter(r => r !== role)
            : [...permission.allowedRoles, role];

        try {
            const response = await fetch('/api/admin/permissions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissionId: permission._id,
                    allowedRoles: newRoles,
                }),
            });

            const data = await response.json();
            if (data.success) {
                // Update local state
                setPermissions(prev => prev.map(p =>
                    p._id === permission._id
                        ? { ...p, allowedRoles: newRoles }
                        : p
                ));
                toast.success(`Permission ${newRoles.includes(role) ? 'granted to' : 'revoked from'} ${role}`);
            } else {
                toast.error(data.error || 'Failed to update permission');
            }
        } catch (error) {
            console.error('Error updating permission:', error);
            toast.error('Failed to update permission');
        }
    };

    const filteredPermissions = permissions.filter(p => {
        const matchesSearch = search === "" ||
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.description.toLowerCase().includes(search.toLowerCase()) ||
            p.key.toLowerCase().includes(search.toLowerCase());

        const matchesCategory = activeCategory === "all" || p.category === activeCategory;

        return matchesSearch && matchesCategory;
    });

    const groupedPermissions = filteredPermissions.reduce((acc, permission) => {
        const category = permission.category;
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(permission);
        return acc;
    }, {} as Record<string, Permission[]>);

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'dietitian':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'health_counselor':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'admin':
                return 'bg-purple-100 text-purple-800 border-purple-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'dietitian':
                return 'Dietitian';
            case 'health_counselor':
                return 'Health Counselor';
            case 'admin':
                return 'Admin';
            default:
                return role;
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-100">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Shield className="h-6 w-6 text-primary" />
                            Permissions Management
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Control what dietitians and health counselors can do in the system
                        </p>
                    </div>
                    <Button onClick={fetchPermissions} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Shield className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Permissions</p>
                                    <p className="text-2xl font-bold">{permissions.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 rounded-lg">
                                    <Users className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Dietitians</p>
                                    <p className="text-2xl font-bold">
                                        {staffUsers.filter(u => u.role === 'dietitian').length}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 rounded-lg">
                                    <Briefcase className="h-5 w-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Health Counselors</p>
                                    <p className="text-2xl font-bold">
                                        {staffUsers.filter(u => u.role === 'health_counselor').length}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-100 rounded-lg">
                                    <Settings className="h-5 w-5 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Categories</p>
                                    <p className="text-2xl font-bold">{categories.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search and Filter */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search permissions..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge
                                    variant={activeCategory === "all" ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => setActiveCategory("all")}
                                >
                                    All
                                </Badge>
                                {categories.map(cat => (
                                    <Badge
                                        key={cat}
                                        variant={activeCategory === cat ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => setActiveCategory(cat)}
                                    >
                                        {cat}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Permissions List */}
                <div className="space-y-6">
                    {Object.entries(groupedPermissions).map(([category, perms]) => (
                        <Card key={category}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                    {category}
                                </CardTitle>
                                <CardDescription>
                                    {perms.length} permission{perms.length !== 1 ? 's' : ''} in this category
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {perms.map((permission) => (
                                        <div
                                            key={permission._id}
                                            className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium truncate">{permission.name}</h4>
                                                    {permission.allowedUsers.length > 0 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            <UserPlus className="h-3 w-3 mr-1" />
                                                            {permission.allowedUsers.length}
                                                        </Badge>
                                                    )}
                                                    {permission.deniedUsers.length > 0 && (
                                                        <Badge variant="destructive" className="text-xs">
                                                            <UserMinus className="h-3 w-3 mr-1" />
                                                            {permission.deniedUsers.length}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                                    {permission.description}
                                                </p>
                                            </div>

                                            {/* Role toggles */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => quickToggleRole(permission, 'dietitian')}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                                                        permission.allowedRoles.includes('dietitian')
                                                            ? "bg-blue-100 text-blue-800 border-blue-300"
                                                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                                                    )}
                                                >
                                                    {permission.allowedRoles.includes('dietitian') ? (
                                                        <CheckCircle className="h-4 w-4 inline mr-1" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 inline mr-1" />
                                                    )}
                                                    Dietitian
                                                </button>
                                                <button
                                                    onClick={() => quickToggleRole(permission, 'health_counselor')}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                                                        permission.allowedRoles.includes('health_counselor')
                                                            ? "bg-green-100 text-green-800 border-green-300"
                                                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                                                    )}
                                                >
                                                    {permission.allowedRoles.includes('health_counselor') ? (
                                                        <CheckCircle className="h-4 w-4 inline mr-1" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 inline mr-1" />
                                                    )}
                                                    Health Counselor
                                                </button>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEditDialog(permission)}
                                                >
                                                    <UserPlus className="h-4 w-4 mr-1" />
                                                    Individual
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Edit Permission Dialog */}
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Edit Permission: {selectedPermission?.name}
                            </DialogTitle>
                            <DialogDescription>
                                {selectedPermission?.description}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto space-y-6 py-4">
                            {/* Role-based Access */}
                            <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Role-based Access
                                </h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    All users with these roles will have this permission
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                        <Checkbox
                                            checked={editForm.allowedRoles.includes('dietitian')}
                                            onCheckedChange={() => handleRoleToggle('dietitian')}
                                        />
                                        <span className={cn(
                                            "px-2 py-1 rounded text-sm font-medium",
                                            getRoleBadgeColor('dietitian')
                                        )}>
                                            Dietitian
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                        <Checkbox
                                            checked={editForm.allowedRoles.includes('health_counselor')}
                                            onCheckedChange={() => handleRoleToggle('health_counselor')}
                                        />
                                        <span className={cn(
                                            "px-2 py-1 rounded text-sm font-medium",
                                            getRoleBadgeColor('health_counselor')
                                        )}>
                                            Health Counselor
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <Separator />

                            {/* Individual User Access */}
                            <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <UserPlus className="h-4 w-4 text-green-600" />
                                    Grant to Specific Users
                                </h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    These users will have this permission regardless of their role settings
                                </p>
                                <ScrollArea className="h-50 border rounded-lg p-2">
                                    <div className="space-y-2">
                                        {staffUsers.map(user => (
                                            <label
                                                key={user._id}
                                                className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                                    editForm.allowedUsers.includes(user._id)
                                                        ? "bg-green-50 border border-green-200"
                                                        : "hover:bg-muted/50"
                                                )}
                                            >
                                                <Checkbox
                                                    checked={editForm.allowedUsers.includes(user._id)}
                                                    onCheckedChange={() => handleUserToggle(user._id, 'allowed')}
                                                />
                                                <div className="flex items-center gap-2 flex-1">
                                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                                        <UserIcon className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">
                                                            {user.firstName} {user.lastName}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={cn("text-xs", getRoleBadgeColor(user.role))}>
                                                    {getRoleLabel(user.role)}
                                                </Badge>
                                            </label>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            <Separator />

                            {/* Denied Users */}
                            <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <UserMinus className="h-4 w-4 text-red-600" />
                                    Deny from Specific Users
                                </h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    These users will NOT have this permission even if their role normally allows it
                                </p>
                                <ScrollArea className="h-50 border rounded-lg p-2">
                                    <div className="space-y-2">
                                        {staffUsers.map(user => (
                                            <label
                                                key={user._id}
                                                className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                                    editForm.deniedUsers.includes(user._id)
                                                        ? "bg-red-50 border border-red-200"
                                                        : "hover:bg-muted/50"
                                                )}
                                            >
                                                <Checkbox
                                                    checked={editForm.deniedUsers.includes(user._id)}
                                                    onCheckedChange={() => handleUserToggle(user._id, 'denied')}
                                                />
                                                <div className="flex items-center gap-2 flex-1">
                                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                                        <UserIcon className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">
                                                            {user.firstName} {user.lastName}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={cn("text-xs", getRoleBadgeColor(user.role))}>
                                                    {getRoleLabel(user.role)}
                                                </Badge>
                                            </label>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        <DialogFooter className="border-t pt-4">
                            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={savePermission} disabled={saving}>
                                {saving ? (
                                    <>
                                        <LoadingSpinner size="sm" className="mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    );
}
