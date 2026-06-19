using Microsoft.EntityFrameworkCore;
using Favigon.Domain.Entities;

namespace Favigon.Infrastructure.Context;

public class FavigonDbContext : Microsoft.EntityFrameworkCore.DbContext
{
    public FavigonDbContext(DbContextOptions<FavigonDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<LinkedAccount> LinkedAccounts { get; set; }
    public DbSet<Project> Projects { get; set; }
    public DbSet<UserFollow> UserFollows { get; set; }
    public DbSet<ProjectBookmark> ProjectBookmarks { get; set; }
    public DbSet<ProjectLike> ProjectLikes { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<User>()
            .ToTable("users");

        modelBuilder.Entity<User>()
            .Property(u => u.CreatedAt)
            .ValueGeneratedNever();

        modelBuilder.Entity<User>()
            .Property(u => u.HasPassword)
            .HasDefaultValue(true);

        modelBuilder.Entity<User>()
            .Property(u => u.IsTwoFactorEnabled)
            .HasDefaultValue(false);

        modelBuilder.Entity<User>()
            .HasMany(u => u.Projects)
            .WithOne(p => p.User)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<User>()
            .HasMany(u => u.LinkedAccounts)
            .WithOne(la => la.User)
            .HasForeignKey(la => la.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<User>()
            .Property(u => u.PasswordResetTokenHash)
            .HasColumnName("password_reset_token_hash")
            .HasMaxLength(64);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.PasswordResetTokenHash)
            .IsUnique()
            .HasFilter("password_reset_token_hash IS NOT NULL");

        modelBuilder.Entity<User>()
            .Property(u => u.PasswordResetExpiresAt)
            .HasColumnName("password_reset_expires_at");

        modelBuilder.Entity<User>()
            .Property(u => u.TwoFactorCodeHash)
            .HasColumnName("two_factor_code_hash")
            .HasMaxLength(64);

        modelBuilder.Entity<User>()
            .Property(u => u.TwoFactorCodeExpiresAt)
            .HasColumnName("two_factor_code_expires_at");

        modelBuilder.Entity<User>()
            .Property(u => u.TwoFactorCodePurpose)
            .HasColumnName("two_factor_code_purpose")
            .HasMaxLength(32);

        modelBuilder.Entity<LinkedAccount>()
            .ToTable("linked_accounts");

        modelBuilder.Entity<LinkedAccount>()
            .HasIndex(la => new { la.Provider, la.ProviderUserId })
            .IsUnique();

        modelBuilder.Entity<LinkedAccount>()
            .HasIndex(la => new { la.UserId, la.Provider })
            .IsUnique();

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.Provider)
            .HasMaxLength(50);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.ProviderUserId)
            .HasMaxLength(255);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.ProviderEmail)
            .HasMaxLength(100);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.CreatedAt)
            .ValueGeneratedNever();

        modelBuilder.Entity<Project>()
            .ToTable("projects");

        modelBuilder.Entity<Project>()
            .Property(p => p.CreatedAt)
            .ValueGeneratedNever();

        modelBuilder.Entity<Project>()
            .Property(p => p.UpdatedAt)
            .ValueGeneratedNever();

        modelBuilder.Entity<Project>()
            .Property(p => p.DesignJson)
            .HasColumnType("jsonb")
            .HasDefaultValue("{}");

        modelBuilder.Entity<UserFollow>()
            .ToTable("user_follows")
            .HasKey(f => new { f.FollowerId, f.FolloweeId });

        modelBuilder.Entity<UserFollow>()
            .HasOne(f => f.Follower)
            .WithMany(u => u.Following)
            .HasForeignKey(f => f.FollowerId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<UserFollow>()
            .HasOne(f => f.Followee)
            .WithMany(u => u.Followers)
            .HasForeignKey(f => f.FolloweeId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProjectBookmark>()
            .ToTable("project_bookmarks")
            .HasKey(b => new { b.UserId, b.ProjectId });

        modelBuilder.Entity<ProjectBookmark>()
            .HasOne(b => b.User)
            .WithMany(u => u.Bookmarks)
            .HasForeignKey(b => b.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProjectBookmark>()
            .HasOne(b => b.Project)
            .WithMany(p => p.Bookmarks)
            .HasForeignKey(b => b.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProjectLike>()
            .ToTable("project_likes")
            .HasKey(l => new { l.UserId, l.ProjectId });

        modelBuilder.Entity<ProjectLike>()
            .HasOne(l => l.User)
            .WithMany()
            .HasForeignKey(l => l.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProjectLike>()
            .HasOne(l => l.Project)
            .WithMany(p => p.Likes)
            .HasForeignKey(l => l.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Project>()
            .HasOne(p => p.ForkedFromProject)
            .WithMany()
            .HasForeignKey(p => p.ForkedFromProjectId)
            .OnDelete(DeleteBehavior.SetNull);
    }

    public override int SaveChanges()
    {
        ApplyTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyTimestamps()
    {
        var utcNow = DateTime.UtcNow;

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Metadata.FindProperty("CreatedAt") != null)
                {
                    var createdAt = entry.Property("CreatedAt");
                    if (createdAt.CurrentValue == null ||
                        (createdAt.CurrentValue is DateTime dt && dt == default))
                    {
                        createdAt.CurrentValue = utcNow;
                    }
                }

                if (entry.Metadata.FindProperty("UpdatedAt") != null)
                {
                    entry.Property("UpdatedAt").CurrentValue = utcNow;
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                if (entry.Metadata.FindProperty("UpdatedAt") != null)
                {
                    var updatedAt = entry.Property("UpdatedAt");
                    updatedAt.CurrentValue = utcNow;
                    updatedAt.IsModified = true;
                }
            }
        }
    }
}
