import UIKit

class SplashViewController: UIViewController {
    
    // MARK: - Properties
    
    private var logoImageView: UIImageView!
    private var textLabel: UILabel!
    private var pillContainerView: UIView!
    private var glowView: UIView!
    private var textContainerView: UIView!
    
    private var mainViewControllerLoaded = false
    private var animationComplete = false
    
    // Colors matching Android
    private let tealColor = UIColor(red: 59/255, green: 167/255, blue: 150/255, alpha: 1.0)
    private let greenColor = UIColor(red: 97/255, green: 160/255, blue: 53/255, alpha: 1.0)
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupUI()
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        
        startAnimation()
    }
    
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }
    
    // MARK: - Setup
    
    private func setupUI() {
        // Gradient background
        view.backgroundColor = .white
        
        let gradientLayer = CAGradientLayer()
        gradientLayer.frame = view.bounds
        gradientLayer.colors = [
            greenColor.withAlphaComponent(0.1).cgColor,
            UIColor.white.cgColor,
            tealColor.withAlphaComponent(0.1).cgColor
        ]
        gradientLayer.startPoint = CGPoint(x: 0, y: 0)
        gradientLayer.endPoint = CGPoint(x: 1, y: 1)
        view.layer.insertSublayer(gradientLayer, at: 0)
        
        // Glow effect
        glowView = UIView()
        glowView.translatesAutoresizingMaskIntoConstraints = false
        glowView.backgroundColor = greenColor.withAlphaComponent(0.2)
        glowView.layer.cornerRadius = 144 // 288/2
        view.addSubview(glowView)
        
        // Apply blur to glow
        glowView.layer.shadowColor = greenColor.cgColor
        glowView.layer.shadowRadius = 60
        glowView.layer.shadowOpacity = 0.5
        glowView.layer.shadowOffset = .zero
        
        // Pill container
        pillContainerView = UIView()
        pillContainerView.translatesAutoresizingMaskIntoConstraints = false
        pillContainerView.backgroundColor = tealColor
        pillContainerView.layer.cornerRadius = 40
        pillContainerView.layer.shadowColor = UIColor.black.cgColor
        pillContainerView.layer.shadowRadius = 25
        pillContainerView.layer.shadowOpacity = 0.25
        pillContainerView.layer.shadowOffset = CGSize(width: 0, height: 12)
        pillContainerView.clipsToBounds = true
        view.addSubview(pillContainerView)
        
        // Logo image
        logoImageView = UIImageView()
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        logoImageView.contentMode = .scaleAspectFill
        logoImageView.backgroundColor = .white
        logoImageView.layer.cornerRadius = 40
        logoImageView.clipsToBounds = true
        logoImageView.alpha = 0
        logoImageView.transform = CGAffineTransform(scaleX: 0.5, y: 0.5)
        
        // Try to load logo from assets, otherwise use placeholder
        if let logo = UIImage(named: "Logo") {
            logoImageView.image = logo
        } else {
            // Create a placeholder with the app name
            logoImageView.backgroundColor = .white
            
            let placeholderLabel = UILabel()
            placeholderLabel.text = "DTPS"
            placeholderLabel.font = .systemFont(ofSize: 20, weight: .bold)
            placeholderLabel.textColor = tealColor
            placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
            logoImageView.addSubview(placeholderLabel)
            NSLayoutConstraint.activate([
                placeholderLabel.centerXAnchor.constraint(equalTo: logoImageView.centerXAnchor),
                placeholderLabel.centerYAnchor.constraint(equalTo: logoImageView.centerYAnchor)
            ])
        }
        pillContainerView.addSubview(logoImageView)
        
        // Text container
        textContainerView = UIView()
        textContainerView.translatesAutoresizingMaskIntoConstraints = false
        textContainerView.clipsToBounds = true
        pillContainerView.addSubview(textContainerView)
        
        // Text label
        textLabel = UILabel()
        textLabel.translatesAutoresizingMaskIntoConstraints = false
        textLabel.text = "DTPS"
        textLabel.font = .systemFont(ofSize: 32, weight: .bold)
        textLabel.textColor = .white
        textLabel.alpha = 0
        textContainerView.addSubview(textLabel)
        
        // Constraints
        NSLayoutConstraint.activate([
            // Glow
            glowView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            glowView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            glowView.widthAnchor.constraint(equalToConstant: 288),
            glowView.heightAnchor.constraint(equalToConstant: 288),
            
            // Pill container - start small
            pillContainerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            pillContainerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            pillContainerView.heightAnchor.constraint(equalToConstant: 80),
            
            // Logo - use flexible width with priority
            logoImageView.leadingAnchor.constraint(equalTo: pillContainerView.leadingAnchor),
            logoImageView.topAnchor.constraint(equalTo: pillContainerView.topAnchor),
            logoImageView.bottomAnchor.constraint(equalTo: pillContainerView.bottomAnchor),
            logoImageView.widthAnchor.constraint(equalTo: logoImageView.heightAnchor),
            
            // Text container - positioned after logo
            textContainerView.leadingAnchor.constraint(equalTo: logoImageView.trailingAnchor),
            textContainerView.trailingAnchor.constraint(equalTo: pillContainerView.trailingAnchor),
            textContainerView.topAnchor.constraint(equalTo: pillContainerView.topAnchor),
            textContainerView.bottomAnchor.constraint(equalTo: pillContainerView.bottomAnchor),
            
            // Text
            textLabel.centerYAnchor.constraint(equalTo: textContainerView.centerYAnchor),
            textLabel.leadingAnchor.constraint(equalTo: textContainerView.leadingAnchor, constant: 16)
        ])
        
        // Store width constraint for animation - pill starts at 80, expands to 220
        pillWidthConstraint = pillContainerView.widthAnchor.constraint(equalToConstant: 80)
        pillWidthConstraint?.isActive = true
    }
    
    private var pillWidthConstraint: NSLayoutConstraint?

    
    // MARK: - Animation
    
    private func startAnimation() {
        // Phase 1: Logo pop in (0.9s)
        UIView.animate(withDuration: 0.9, delay: 0, usingSpringWithDamping: 0.6, initialSpringVelocity: 0, options: [], animations: {
            self.logoImageView.alpha = 1
            self.logoImageView.transform = .identity
        }) { _ in
            // Phase 2: Expand pill and show text (0.6s)
            self.expandPillAndShowText()
        }
    }
    
    private func expandPillAndShowText() {
        // Expand pill width (from 80 to 220)
        pillWidthConstraint?.constant = 220
        
        UIView.animate(withDuration: 0.6, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0, options: [], animations: {
            self.view.layoutIfNeeded()
        })
        
        // Fade in text with typewriter effect
        UIView.animate(withDuration: 0.4, delay: 0.3, options: [], animations: {
            self.textLabel.alpha = 1
        }) { _ in
            // Wait a moment then transition
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                self.animationComplete = true
                self.transitionToMainApp()
            }
        }
    }
    
    private func transitionToMainApp() {
        let mainVC = MainViewController()
        mainVC.modalTransitionStyle = .crossDissolve
        mainVC.modalPresentationStyle = .fullScreen
        
        // Fade out splash and present main
        UIView.animate(withDuration: 0.5, animations: {
            self.view.alpha = 0
        }) { _ in
            // Set as root view controller
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                window.rootViewController = mainVC
                window.makeKeyAndVisible()
            }
        }
    }
}
