"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Trash2, Eye, Plus, Edit, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useDebounce } from "@/hooks/useDebounce";

interface Recipe {
  _id: string;
  name: string;
  uuid?: string;
  createdBy?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // Flat nutrition fields (from API)
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servings?: number | string;
  servingSize?: string;
  isActive?: boolean;
}

export default function AdminRecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState(false);
  const itemsPerPage = 20;

  // Debounce search term
  const debouncedSearch = useDebounce(search, 400);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRecipes = useCallback(async (page = 1, searchQuery = '') => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // Use relevance sorting when searching
      const sortParam = searchQuery ? 'sortBy=relevance' : 'sortBy=uuid';
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(
        `/api/recipes?limit=${itemsPerPage}&page=${page}&includeTotal=true&${sortParam}${searchParam}`,
        { signal: abortControllerRef.current.signal }
      );
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || body.details || "Failed to load recipes");
      }

      // Ensure recipes are properly displayed even if createdBy is missing
      const recipesData = (body.recipes || []).map((recipe: any) => ({
        ...recipe,
        createdBy: recipe.createdBy || null,
        createdAt: recipe.createdAt || recipe.updatedAt || new Date().toISOString()
      }));

      setRecipes(recipesData);
      setTotalRecipes(body.pagination?.total || 0);
      setTotalPages(body.pagination?.pages || 1);
      setCurrentPage(page);

      console.log(`Fetched ${recipesData.length} recipes from total ${body.pagination?.total}`);
    } catch (e: any) {
      // Ignore abort errors
      if (e.name === 'AbortError') return;
      console.error('Error fetching recipes:', e);
      setError(e?.message || "Failed to load recipes");
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  // Show searching indicator when user is typing
  useEffect(() => {
    if (search !== debouncedSearch) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [search, debouncedSearch]);

  // Fetch recipes when debounced search changes
  useEffect(() => {
    fetchRecipes(1, debouncedSearch);
  }, [debouncedSearch, fetchRecipes]);

  async function handleDelete() {
    if (!deletingRecipe) return;

    try {
      setDeleting(true);
      setError(null);
      const res = await fetch(`/api/recipes/${deletingRecipe._id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(await res.text());

      setRecipes(recipes.filter(r => r._id !== deletingRecipe._id));
      setDeleteDialogOpen(false);
      setDeletingRecipe(null);
    } catch (e: any) {
      setError(e?.message || "Failed to delete recipe");
    } finally {
      setDeleting(false);
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No Date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const getDietitianName = (recipe: Recipe) => {
    if (!recipe.createdBy) return 'Not Assigned';
    const firstName = recipe.createdBy.firstName || 'Unknown';
    const lastName = recipe.createdBy.lastName || '';
    return `Dt. ${firstName} ${lastName}`.trim();
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 space-y-6 ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6 ">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recipe Management</h1>
            <p className="text-gray-600 mt-1">Manage all recipes in the system</p>
          </div>
          <Link href="/recipes/create">
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Recipe
            </Button>
          </Link>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Search bar */}
        <Card>
          <CardHeader>
            <CardTitle>Search Recipes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Input
                placeholder="Search by UUID, recipe name, dietitian, or ingredients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pr-10"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
              )}
              {search && !isSearching && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recipes Table */}
        <Card>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : recipes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No recipes found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left font-semibold text-gray-900">S/No</th>
                      <th className="p-3 text-left font-semibold text-gray-900">UUID</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Recipe Name</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Created By (Dietitian)</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Created Date</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Calories</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Protein (g)</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Carbs (g)</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Fat (g)</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Serving Size</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe, index) => (
                      <tr key={recipe._id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          {((currentPage - 1) * itemsPerPage) + index + 1}
                        </td>
                        <td className="p-3">
                          <span className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded font-semibold text-sm">
                            {recipe?.uuid || '-'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-900">{recipe.name}</div>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{getDietitianName(recipe)}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{formatDate(recipe.createdAt)}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{recipe?.calories || '-'}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{recipe?.protein || '-'}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{recipe?.carbs || '-'}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{recipe?.fat || '-'}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-gray-700">{recipe?.servingSize || '-'}</span>
                        </td>
                        <td className="p-3 flex gap-2">
                          <Link
                            href={`/recipes/${recipe._id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded hover:bg-teal-100 transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="text-xs font-medium">View</span>
                          </Link>
                          <Link
                            href={`/recipes/${recipe._id}/edit`}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                            <span className="text-xs font-medium">Edit</span>
                          </Link>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setDeletingRecipe(recipe);
                              setDeleteDialogOpen(true);
                            }}
                            className="h-8 px-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalRecipes)} of {totalRecipes} recipes
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchRecipes(currentPage - 1, debouncedSearch)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => fetchRecipes(pageNum, debouncedSearch)}
                          className="w-10"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchRecipes(currentPage + 1, debouncedSearch)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe?</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-gray-600">
              Are you sure you want to delete <span className="font-semibold">{deletingRecipe?.name}</span>?
            </p>
            <p className="text-sm text-gray-500">
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}








